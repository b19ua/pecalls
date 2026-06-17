import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyTwilioRequest } from "@/lib/twilio-verify.server";

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

async function handleVoiceRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const agentIdParam = url.searchParams.get("agent_id");
  const method = request.method.toUpperCase();

  // Twilio's SIP Domain webhook can be configured as GET or POST.
  // With GET, all params live in the query string; with POST, in the form body.
  // We merge both so routing logic doesn't care which method was used.
  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) params.append(k, v);
  let formForVerify: URLSearchParams | null = null;
  if (method === "POST") {
    try {
      const form = await request.formData();
      formForVerify = new URLSearchParams();
      for (const [k, v] of form.entries()) {
        params.append(k, String(v));
        formForVerify.append(k, String(v));
      }
    } catch {
      // empty body — ignore
    }
  }

  // Signature verification only meaningful for POST (Twilio signs the form body)
  if (method === "POST" && formForVerify) {
    if (!(await verifyTwilioRequest(request, formForVerify))) {
      return new Response("Invalid signature", { status: 403 });
    }
  }

  const callSid = String(params.get("CallSid") ?? "");
  const fromRaw = String(params.get("From") ?? "");
  const toRaw = String(params.get("To") ?? "");
  const direction = String(params.get("Direction") ?? "inbound");
  const sipDomainSid = String(params.get("SipDomainSid") ?? "");

  console.log("[twilio/voice] incoming", { method, callSid, fromRaw, toRaw, direction, sipDomainSid, agentIdParam });

  function parseTo(to: string): { kind: "sip"; user: string; host: string } | { kind: "phone"; number: string } {
    const sipMatch = to.match(/^sips?:([^@;>\s]+)@([^;>\s]+)/i);
    if (sipMatch) {
      return { kind: "sip", user: sipMatch[1], host: sipMatch[2].toLowerCase() };
    }
    const cleaned = to.replace(/[^\d+]/g, "");
    return { kind: "phone", number: cleaned };
  }
  const parsed = toRaw ? parseTo(toRaw) : null;
  const fromNumber = fromRaw.replace(/[^\d+]/g, "") || fromRaw;
  const toNumber = parsed?.kind === "phone" ? parsed.number : toRaw;

  let agentId = agentIdParam || null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agent: any = null;

  if (agentId) {
    const { data } = await supabaseAdmin.from("agents").select("*").eq("id", agentId).maybeSingle();
    agent = data;
  } else if (sipDomainSid) {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("inbound_sip_domain_sid", sipDomainSid)
      .eq("is_active", true)
      .maybeSingle();
    agent = data;
    agentId = data?.id ?? null;
  }

  if (!agent && parsed?.kind === "sip") {
    const userLower = parsed.user.toLowerCase();
    const { data: byUser } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("inbound_connection_type", "sip_uri")
      .ilike("inbound_sip_uri_user", userLower)
      .eq("is_active", true)
      .maybeSingle();
    if (byUser) {
      agent = byUser;
      agentId = byUser.id;
    } else {
      const { data } = await supabaseAdmin
        .from("agents")
        .select("*")
        .eq("inbound_sip_domain", parsed.host)
        .eq("is_active", true)
        .maybeSingle();
      agent = data;
      agentId = data?.id ?? null;
    }
  } else if (!agent && parsed?.kind === "phone" && parsed.number) {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("inbound_connection_type", "phone")
      .eq("twilio_number_e164", parsed.number)
      .eq("is_active", true)
      .maybeSingle();
    agent = data;
    agentId = data?.id ?? null;
  }

  if (!agent) {
    console.warn("[twilio/voice] no agent matched", { toRaw, sipDomainSid, agentIdParam });
    return twiml(`<Say voice="alice" language="ru-RU">Извините, агент недоступен. Попробуйте позже.</Say><Hangup/>`);
  }

  if (callSid) {
    await supabaseAdmin.from("calls").upsert(
      {
        owner_id: agent.owner_id,
        agent_id: agent.id,
        twilio_call_sid: callSid,
        direction: direction === "inbound" ? "inbound" : "outbound",
        from_number: fromNumber || null,
        to_number: toNumber || null,
        status: "in_progress",
        started_at: new Date().toISOString(),
      },
      { onConflict: "twilio_call_sid" },
    );
  }

  const greeting = escapeXml(agent.greeting || "Здравствуйте!");
  const lang = agent.language || "ru-RU";

  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const defaultBridge = supaUrl
    ? supaUrl.replace(/^https?:/, "wss:").replace(/\/$/, "") + "/functions/v1/voice-call-bridge"
    : "";
  const bridgeWs = process.env.GEMINI_BRIDGE_WS_URL || defaultBridge;

  if (bridgeWs) {
    const streamUrl = `${bridgeWs.replace(/\/$/, "")}?agent_id=${agent.id}&call_sid=${callSid}`;
    return twiml(
      `<Connect><Stream url="${escapeXml(streamUrl)}"><Parameter name="agent_id" value="${agent.id}"/><Parameter name="call_sid" value="${callSid}"/></Stream></Connect>`,
    );
  }

  if (agent.handoff_enabled && Array.isArray(agent.handoff_numbers) && agent.handoff_numbers.length > 0) {
    const target = agent.handoff_numbers[Math.floor(Math.random() * agent.handoff_numbers.length)];
    await supabaseAdmin
      .from("calls")
      .update({ handoff_to: target, handoff_at: new Date().toISOString() })
      .eq("twilio_call_sid", callSid);
    return twiml(
      `<Say voice="alice" language="${escapeXml(lang)}">${greeting} Соединяю с оператором.</Say>` +
        `<Dial>${escapeXml(target)}</Dial>`,
    );
  }

  return twiml(
    `<Say voice="alice" language="${escapeXml(lang)}">${greeting} Голосовой мост ещё не настроен. До свидания.</Say><Hangup/>`,
  );
}

export const Route = createFileRoute("/api/public/twilio/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => handleVoiceRequest(request),
      GET: async ({ request }) => handleVoiceRequest(request),
    },
  },
});
