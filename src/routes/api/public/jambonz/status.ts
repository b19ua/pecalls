import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Jambonz Call-Status Webhook
 *
 * Configure in Jambonz: Applications → your app → Call Status Webhook
 *   URL: https://<your-domain>/api/public/jambonz/status
 */

export const Route = createFileRoute("/api/public/jambonz/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.JAMBONZ_WEBHOOK_SECRET;
        if (expected) {
          const got = request.headers.get("x-webhook-secret") ?? "";
          if (got !== expected) return new Response("Unauthorized", { status: 401 });
        }

        const body: any = await request.json().catch(() => ({}));
        const callSid = String(body.call_sid ?? "");
        const status = String(body.call_status ?? body.event ?? "");
        const duration = Number(body.duration ?? body.call_duration ?? 0);
        const recordingUrl = body.recording_url ?? body.recordingUrl ?? null;
        if (!callSid) return new Response("ok");

        const map: Record<string, string> = {
          trying: "ringing",
          ringing: "ringing",
          "early-media": "ringing",
          "in-progress": "in_progress",
          answered: "in_progress",
          completed: "completed",
          failed: "failed",
          busy: "failed",
          "no-answer": "failed",
        };

        await supabaseAdmin
          .from("calls")
          .update({
            status: (map[status] ?? "in_progress") as any,
            duration_seconds: duration || 0,
            ...(status === "completed" ? { ended_at: new Date().toISOString() } : {}),
            ...(recordingUrl ? { recording_url: recordingUrl } : {}),
          })
          .eq("twilio_call_sid", callSid);

        return new Response("ok");
      },
    },
  },
});
