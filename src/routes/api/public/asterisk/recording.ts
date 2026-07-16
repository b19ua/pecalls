// Recording upload endpoint for Asterisk MixMonitor.
// The bridge host uploads the finished WAV/MP3 via multipart/form-data:
//   POST /api/public/asterisk/recording
//   Headers: X-Asterisk-Secret: <shared secret>
//   Fields: call_uuid, file
//
// Configure the shared secret as ASTERISK_WEBHOOK_SECRET (add via add_secret).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/asterisk/recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.ASTERISK_WEBHOOK_SECRET;
        if (!secret) return new Response("Missing server secret", { status: 500 });
        if ((request.headers.get("x-asterisk-secret") || "") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const form = await request.formData();
        const callUuid = String(form.get("call_uuid") || "").trim();
        const file = form.get("file");
        if (!callUuid || !(file instanceof File)) {
          return new Response("call_uuid + file required", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ext = (file.name.split(".").pop() || "wav").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `asterisk/${callUuid}.${ext || "wav"}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const up = await supabaseAdmin.storage.from("call-recordings").upload(path, bytes, {
          contentType: file.type || "audio/wav",
          upsert: true,
        });
        if (up.error) return new Response(`Upload failed: ${up.error.message}`, { status: 500 });

        const signed = await supabaseAdmin.storage.from("call-recordings").createSignedUrl(path, 60 * 60 * 24 * 30);
        const url = signed.data?.signedUrl || null;
        const { error } = await supabaseAdmin
          .from("calls")
          .update({ recording_url: url, recording_path: path } as never)
          .eq("twilio_call_sid", callUuid);
        if (error) return new Response(`DB update failed: ${error.message}`, { status: 500 });
        return new Response(JSON.stringify({ ok: true, url }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
