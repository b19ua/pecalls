import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/twilio/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const callSid = String(form.get("CallSid") ?? "");
        const status = String(form.get("CallStatus") ?? "");
        const duration = Number(form.get("CallDuration") ?? 0);
        const recordingUrl = (form.get("RecordingUrl") as string | null) ?? null;
        if (!callSid) return new Response("ok");

        const map: Record<string, string> = {
          queued: "queued",
          ringing: "ringing",
          "in-progress": "in_progress",
          completed: "completed",
          busy: "failed",
          failed: "failed",
          "no-answer": "failed",
          canceled: "failed",
        };
        const update: Record<string, unknown> = {
          status: map[status] ?? "in_progress",
          duration_seconds: duration || 0,
        };
        if (status === "completed") update.ended_at = new Date().toISOString();
        if (recordingUrl) update.recording_url = `${recordingUrl}.mp3`;

        await supabaseAdmin.from("calls").update(update).eq("twilio_call_sid", callSid);
        return new Response("ok");
      },
    },
  },
});
