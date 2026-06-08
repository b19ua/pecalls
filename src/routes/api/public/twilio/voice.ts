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

export const Route = createFileRoute("/api/public/twilio/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const agentIdParam = url.searchParams.get("agent_id");
        const form = await request.formData();
        if (!(await verifyTwilioRequest(request, form))) {
          return new Response("Invalid signature", { status: 403 });
        }
        const callSid = String(form.get("CallSid") ?? "");
        const fromRaw = String(form.get("From") ?? "");
        const toRaw = String(form.get("To") ?? "");
        const direction = String(form.get("Direction") ?? "inbound");
        const sipDomainSid = String(form.get("SipDomainSid") ?? "");

        // Normalize SIP URI -> bare number/identifier for storage
        const stripSip = (s: string) => {
          const m = s.match(/^sips?:([^@;>\s]+)/i);
          return m ? (m[1].startsWith("+") || /^\d+$/.test(m[1]) ? m[1] : s) : s;
        };
        const fromNumber = stripSip(fromRaw);
        const toNumber = stripSip(toRaw);

        // Resolve agent. Priority: explicit param > SipDomainSid > SIP To domain > PSTN To number
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
        if (!agent && toRaw) {
          const sipMatch = toRaw.match(/^sips?:[^@]+@([^;>\s]+)/i);
          if (sipMatch) {
            const domain = sipMatch[1].toLowerCase();
            const { data } = await supabaseAdmin
              .from("agents")
              .select("*")
              .eq("inbound_sip_domain", domain)
              .eq("is_active", true)
              .maybeSingle();
            agent = data;
            agentId = data?.id ?? null;
          } else {
            const { data } = await supabaseAdmin
              .from("agents")
              .select("*")
              .eq("twilio_number_e164", toRaw)
              .eq("is_active", true)
              .maybeSingle();
            agent = data;
            agentId = data?.id ?? null;
          }
        }


        if (!agent) {
          return twiml(`<Say voice="alice" language="ru-RU">Извините, агент недоступен. Попробуйте позже.</Say><Hangup/>`);
        }

        // Upsert call record (inbound case — outbound is created in placeOutboundCall)
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

        // Build TwiML — connect Twilio Media Stream to our Supabase edge bridge.
        const greeting = escapeXml(agent.greeting || "Здравствуйте!");
        const lang = agent.language || "ru-RU";

        // Default bridge: Supabase edge function (wss). Override with GEMINI_BRIDGE_WS_URL if needed.
        const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const defaultBridge = supaUrl
          ? supaUrl.replace(/^https?:/, "wss:").replace(/\/$/, "") + "/functions/v1/voice-call-bridge"
          : "";
        const bridgeWs = process.env.GEMINI_BRIDGE_WS_URL || defaultBridge;

        // Recording is started inside the voice-call-bridge edge function
        // once the Twilio Media Stream is connected. Doing it here as well
        // would race and conflict with the bridge's request.

        if (bridgeWs) {
          const streamUrl = `${bridgeWs.replace(/\/$/, "")}?agent_id=${agent.id}&call_sid=${callSid}`;
          return twiml(
            `<Connect><Stream url="${escapeXml(streamUrl)}"><Parameter name="agent_id" value="${agent.id}"/><Parameter name="call_sid" value="${callSid}"/></Stream></Connect>`,
          );
        }

        // No bridge yet: handoff fallback if numbers configured, else polite hangup
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
      },
    },
  },
});
