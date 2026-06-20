// Public TwiML endpoint for AI Copilot.
// Usage on a Twilio number's Voice webhook:
//   POST https://<project>.lovable.app/api/public/twilio/copilot-stream?agent_id=<copilot_agent_id>&dial=<E164>
//
// Returns TwiML that:
//   1. Starts a parallel Media Stream (both tracks) to copilot-bridge — silent listener.
//   2. Dials the manager normally so the manager↔customer leg works as usual.
//
// If `dial` is omitted, we try the agent's linked twilio_number (customer→manager flow),
// otherwise fall back to <Say> with a clear message so misconfig is visible.

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

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) params.append(k, v);
  let form: FormData | null = null;
  if (method === "POST") {
    try {
      form = await request.formData();
      for (const [k, v] of form.entries()) params.append(k, String(v));
    } catch { /* empty body */ }
  }
  if (method === "POST" && form) {
    if (!(await verifyTwilioRequest(request, form))) {
      return new Response("Invalid signature", { status: 403 });
    }
  }

  const agentId = params.get("agent_id") || url.searchParams.get("agent_id") || "";
  const dialParam = params.get("dial") || url.searchParams.get("dial") || "";
  const managerNameParam = params.get("manager") || url.searchParams.get("manager") || "";
  const callSid = String(params.get("CallSid") ?? "");
  const fromRaw = String(params.get("From") ?? "");
  const toRaw = String(params.get("To") ?? "");

  if (!agentId) {
    return twiml(`<Say voice="alice" language="ru-RU">Copilot не настроен: отсутствует agent_id.</Say><Hangup/>`);
  }

  const { data: agent } = await supabaseAdmin
    .from("copilot_agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();

  if (!agent) {
    return twiml(`<Say voice="alice" language="ru-RU">Copilot-агент не найден.</Say><Hangup/>`);
  }
  if (!agent.enabled) {
    // Не блокируем звонок — просто пропускаем без подсказок.
    if (dialParam) {
      return twiml(`<Dial>${escapeXml(dialParam)}</Dial>`);
    }
  }

  // Open a session up-front so the dashboard sees the active call immediately,
  // even before audio starts flowing into the bridge.
  let sessionId = "";
  if (agent.enabled) {
    const { data: session } = await supabaseAdmin
      .from("copilot_sessions")
      .insert({
        owner_id: agent.owner_id,
        agent_id: agent.id,
        call_sid: callSid || null,
        customer_phone: fromRaw || null,
        manager_name: managerNameParam || null,
        status: "active",
      })
      .select("id")
      .single();
    sessionId = (session as { id?: string } | null)?.id ?? "";
  }

  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const bridgeWs = supaUrl
    ? supaUrl.replace(/^https?:/, "wss:").replace(/\/$/, "") + "/functions/v1/copilot-bridge"
    : "";

  const dialTarget = dialParam || toRaw;
  const streamUrl = bridgeWs
    ? `${bridgeWs}?agent_id=${encodeURIComponent(agent.id)}&session_id=${encodeURIComponent(sessionId)}&call_sid=${encodeURIComponent(callSid)}&manager=${encodeURIComponent(managerNameParam)}&customer=${encodeURIComponent(fromRaw)}`
    : "";

  // <Start><Stream/> is non-blocking: the call continues to <Dial> while copilot listens.
  const streamXml = agent.enabled && streamUrl
    ? `<Start><Stream name="copilot" url="${escapeXml(streamUrl)}"><Parameter name="tracks" value="both_tracks"/><Parameter name="session_id" value="${sessionId}"/></Stream></Start>`
    : "";

  if (!dialTarget) {
    return twiml(
      `${streamXml}<Say voice="alice" language="ru-RU">Copilot слушает, но не указан номер для соединения. Добавьте параметр dial.</Say><Hangup/>`,
    );
  }

  return twiml(`${streamXml}<Dial answerOnBridge="true">${escapeXml(dialTarget)}</Dial>`);
}

export const Route = createFileRoute("/api/public/twilio/copilot-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
