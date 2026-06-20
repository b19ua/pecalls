// Public TwiML endpoint for AI Copilot "Test Call" sales demo.
// Twilio fetches this URL when the outbound call is answered.
//   1) Greets the user with a short message in their language.
//   2) Starts a Media Stream to copilot-bridge — both tracks.
//   3) Pauses so the user can talk freely with an imaginary manager
//      (the copilot will transcribe and emit live suggestions).

import { createFileRoute } from "@tanstack/react-router";
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

const GREETINGS: Record<string, { voice: string; lang: string; text: string }> = {
  ru: {
    voice: "Polly.Tatyana",
    lang: "ru-RU",
    text: "Здравствуйте! Это демо-звонок AI Copilot от Lunara. Поговорите как клиент: задайте вопросы о цене, выскажите возражения, попросите скидку. На дашборде в реальном времени появятся подсказки. У вас две минуты.",
  },
  ro: {
    voice: "Polly.Carmen",
    lang: "ro-RO",
    text: "Bună ziua! Acesta este un apel demo AI Copilot. Vorbiți ca un client: întrebați despre preț, obiectați, cereți o reducere. Sugestiile vor apărea în timp real pe panou. Aveți două minute.",
  },
  en: {
    voice: "Polly.Joanna",
    lang: "en-US",
    text: "Hi! This is an AI Copilot demo call from Lunara. Speak as a customer: ask about pricing, raise objections, request a discount. Suggestions will appear live on your dashboard. You have two minutes.",
  },
};

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

  const agentId = params.get("agent_id") || "";
  const sessionId = params.get("session_id") || "";
  const lang = (params.get("lang") || "ru").toLowerCase();
  const callSid = String(params.get("CallSid") ?? "");

  if (!agentId || !sessionId) {
    return twiml(`<Say voice="alice" language="en-US">Test call misconfigured: missing parameters.</Say><Hangup/>`);
  }

  const g = GREETINGS[lang] || GREETINGS.ru;

  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const bridgeWs = supaUrl
    ? supaUrl.replace(/^https?:/, "wss:").replace(/\/$/, "") + "/functions/v1/copilot-bridge"
    : "";

  const streamUrl = bridgeWs
    ? `${bridgeWs}?agent_id=${encodeURIComponent(agentId)}&session_id=${encodeURIComponent(sessionId)}&call_sid=${encodeURIComponent(callSid)}&manager=${encodeURIComponent("Test Call")}&customer=${encodeURIComponent("demo")}`
    : "";

  const streamXml = streamUrl
    ? `<Start><Stream name="copilot" url="${escapeXml(streamUrl)}"><Parameter name="tracks" value="both_tracks"/><Parameter name="session_id" value="${sessionId}"/></Stream></Start>`
    : "";

  return twiml(
    `${streamXml}` +
      `<Say voice="${g.voice}" language="${g.lang}">${escapeXml(g.text)}</Say>` +
      `<Pause length="115"/>` +
      `<Say voice="${g.voice}" language="${g.lang}">Демо завершено. До свидания.</Say>` +
      `<Hangup/>`,
  );
}

export const Route = createFileRoute("/api/public/twilio/copilot-test-twiml")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
