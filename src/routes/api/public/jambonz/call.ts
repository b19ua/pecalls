import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Jambonz Call Webhook
 *
 * Configure in Jambonz: Applications → your app → Calling Webhook
 *   URL: https://<your-domain>/api/public/jambonz/call?agent_id=<uuid>
 *   Method: POST  Content-type: JSON
 *
 * Jambonz POSTs CallInfo JSON when a call lands on a number tied to this app.
 * We respond with a Jambonz application (array of verbs).
 *
 * For the AI voice path we use the `listen` verb to stream bidirectional audio
 * over WebSocket to our existing voice-call-bridge edge function.
 * Audio format adapter (PCM16 ↔ µ-law) must be enabled inside the bridge with
 * `?provider=jambonz` (handled there).
 */

type JambonzCallInfo = {
  call_sid: string;
  account_sid?: string;
  from: string;
  to: string;
  direction: "inbound" | "outbound";
  call_status?: string;
  application_sid?: string;
  // ...other fields
};

export const Route = createFileRoute("/api/public/jambonz/call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const agentIdParam = url.searchParams.get("agent_id");
        const info = (await request.json()) as JambonzCallInfo;

        // Optional shared-secret auth via header configured in Jambonz application
        const expected = process.env.JAMBONZ_WEBHOOK_SECRET;
        if (expected) {
          const got = request.headers.get("x-webhook-secret") ?? "";
          if (got !== expected) return new Response("Unauthorized", { status: 401 });
        }

        // Resolve agent: explicit ?agent_id wins, else lookup by called destination (SIP URI or phone)
        console.log("[jambonz/call] incoming", { call_sid: info.call_sid, from: info.from, to: info.to, direction: info.direction });
        let agent: any = null;
        if (agentIdParam) {
          const { data } = await supabaseAdmin.from("agents").select("*").eq("id", agentIdParam).maybeSingle();
          agent = data;
        } else if (info.to) {
          const sipMatch = info.to.match(/^sips?:([^@;>\s]+)@([^;>\s]+)/i);
          if (sipMatch) {
            const userLower = sipMatch[1].toLowerCase();
            const { data } = await supabaseAdmin
              .from("agents")
              .select("*")
              .eq("inbound_connection_type", "sip_uri")
              .ilike("inbound_sip_uri_user", userLower)
              .eq("is_active", true)
              .maybeSingle();
            agent = data;
          } else {
            const cleaned = info.to.replace(/[^\d+]/g, "");
            const { data } = await supabaseAdmin
              .from("agents")
              .select("*")
              .eq("inbound_connection_type", "phone")
              .eq("twilio_number_e164", cleaned)
              .eq("is_active", true)
              .maybeSingle();
            agent = data;
          }
        }

        if (!agent) {
          return Response.json([
            { verb: "say", text: "Sorry, no agent is configured for this number.", synthesizer: { vendor: "google", language: "en-US" } },
            { verb: "hangup" },
          ]);
        }

        // Record the call
        await supabaseAdmin.from("calls").upsert(
          {
            owner_id: agent.owner_id,
            agent_id: agent.id,
            twilio_call_sid: info.call_sid, // reuse column; provider-agnostic
            direction: info.direction,
            from_number: info.from,
            to_number: info.to,
            status: "in_progress",
            started_at: new Date().toISOString(),
          },
          { onConflict: "twilio_call_sid" },
        );

        const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const bridgeWss = supaUrl
          ? supaUrl.replace(/^https?:/, "wss:").replace(/\/$/, "") + "/functions/v1/voice-call-bridge"
          : "";

        if (!bridgeWss) {
          return Response.json([
            { verb: "say", text: agent.greeting || "Привет!", synthesizer: { vendor: "google", language: agent.language || "ru-RU" } },
            { verb: "hangup" },
          ]);
        }

        const listenUrl = `${bridgeWss}?agent_id=${agent.id}&call_sid=${info.call_sid}&provider=jambonz`;

        // Jambonz `listen` streams 16-bit linear PCM (L16) at 8 kHz or 16 kHz mono
        return Response.json([
          {
            verb: "config",
            recognizer: { vendor: "google", language: agent.language || "ru-RU" },
            synthesizer: { vendor: "google", language: agent.language || "ru-RU" },
          },
          {
            verb: "listen",
            url: listenUrl,
            mixType: "stereo",
            sampleRate: 8000,
            passDtmf: true,
            bidirectionalAudio: { enabled: true, streaming: true, sampleRate: 8000 },
            actionHook: "/api/public/jambonz/status",
          },
        ]);
      },
    },
  },
});
