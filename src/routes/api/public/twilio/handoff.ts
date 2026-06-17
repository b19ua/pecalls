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

export const Route = createFileRoute("/api/public/twilio/handoff")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const form = await request.formData();
        if (!(await verifyTwilioRequest(request, form))) {
          return new Response("Invalid signature", { status: 403 });
        }

        const callSid = String(form.get("CallSid") || url.searchParams.get("call_sid") || "");
        const agentId = String(url.searchParams.get("agent_id") || "");
        const digit = String(form.get("Digits") || "").trim();

        const { data: call } = callSid
          ? await supabaseAdmin.from("calls").select("agent_id").eq("twilio_call_sid", callSid).maybeSingle()
          : { data: null };
        const trustedAgentId = String(call?.agent_id || agentId || "");
        if (!trustedAgentId) return twiml(`<Reject/>`);

        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("id, handoff_enabled, handoff_dtmf_digit, handoff_numbers, twilio_number_e164, language")
          .eq("id", trustedAgentId)
          .eq("is_active", true)
          .maybeSingle();

        const expectedDigit = String(agent?.handoff_dtmf_digit || "0");
        const numbers = Array.isArray(agent?.handoff_numbers) ? agent.handoff_numbers.filter(Boolean) : [];
        if (!agent?.handoff_enabled || digit !== expectedDigit || numbers.length === 0) {
          return twiml(`<Say voice="alice" language="ru-RU">Оператор сейчас недоступен.</Say><Hangup/>`);
        }

        const target = String(numbers[Math.floor(Math.random() * numbers.length)]);
        if (callSid) {
          await supabaseAdmin
            .from("calls")
            .update({ handoff_to: target, handoff_at: new Date().toISOString(), status: "handoff" })
            .eq("twilio_call_sid", callSid);
        }

        const callerId = agent.twilio_number_e164 ? ` callerId="${escapeXml(agent.twilio_number_e164)}"` : "";
        const lang = escapeXml(agent.language || "ru-RU");
        console.log("[twilio/handoff] dialing", { callSid, agentId: trustedAgentId, digit, target });
        return twiml(
          `<Say voice="alice" language="${lang}">Соединяю с оператором.</Say>` +
            `<Dial${callerId} answerOnBridge="true" timeout="30"><Number>${escapeXml(target)}</Number></Dial>`,
        );
      },
    },
  },
});