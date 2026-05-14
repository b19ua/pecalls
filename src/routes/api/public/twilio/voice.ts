import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
        const callSid = String(form.get("CallSid") ?? "");
        const fromNumber = String(form.get("From") ?? "");
        const toNumber = String(form.get("To") ?? "");
        const direction = String(form.get("Direction") ?? "inbound");

        // Resolve agent: explicit param OR by To number lookup (inbound)
        let agentId = agentIdParam || null;
        let agent: any = null;
        if (!agentId && toNumber) {
          const { data } = await supabaseAdmin
            .from("agents")
            .select("*")
            .eq("twilio_number_e164", toNumber)
            .eq("is_active", true)
            .maybeSingle();
          agent = data;
          agentId = data?.id ?? null;
        } else if (agentId) {
          const { data } = await supabaseAdmin.from("agents").select("*").eq("id", agentId).maybeSingle();
          agent = data;
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

        // Build TwiML — MVP: greeting + Gather DTMF for handoff + reroute to bridge if configured
        const bridgeWs = process.env.GEMINI_BRIDGE_WS_URL; // ws(s)://... external bridge service
        const greeting = escapeXml(agent.greeting || "Здравствуйте!");
        const lang = agent.language || "ru-RU";

        if (bridgeWs) {
          const streamUrl = `${bridgeWs.replace(/\/$/, "")}/?agent_id=${agent.id}&call_sid=${callSid}`;
          return twiml(
            `<Say voice="alice" language="${escapeXml(lang)}">${greeting}</Say>` +
              `<Connect><Stream url="${escapeXml(streamUrl)}"><Parameter name="agent_id" value="${agent.id}"/></Stream></Connect>`,
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
