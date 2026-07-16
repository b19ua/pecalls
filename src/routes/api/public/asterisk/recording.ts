// Recording upload endpoint for Asterisk MixMonitor (per-agent auth).
//
// Каждый клиент подписывает загрузку СВОИМ секретом (agents.asterisk_webhook_secret),
// сгенерированным в UI редактора агента. Никаких общих env-секретов.
//
//   POST /api/public/asterisk/recording
//   Headers: X-Asterisk-Secret: <per-agent secret>
//   Fields: call_uuid, file
//
// Ответ 401 отдаётся ЕДИНООБРАЗНО для «нет записи», «нет секрета у агента»
// и «секрет не совпал» — атакующий не должен по коду отличать эти случаи.
import { createFileRoute } from "@tanstack/react-router";

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

// timingSafeEqual для двух строк одинаковой формы; всегда возвращает false, если длины разные.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export const Route = createFileRoute("/api/public/asterisk/recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supplied = (request.headers.get("x-asterisk-secret") || "").trim();
        if (!supplied) return unauthorized();

        const form = await request.formData();
        const callUuid = String(form.get("call_uuid") || "").trim();
        const file = form.get("file");
        if (!callUuid || !(file instanceof File)) {
          // Не палим наличие записи: те же 401.
          return unauthorized();
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) call → agent_id + owner_id
        const { data: call } = await supabaseAdmin
          .from("calls")
          .select("agent_id, owner_id")
          .eq("twilio_call_sid", callUuid)
          .maybeSingle();
        if (!call?.agent_id || !call.owner_id) return unauthorized();

        // 2) agent → asterisk_webhook_secret (per-owner isolation)
        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("asterisk_webhook_secret, telephony_provider")
          .eq("id", call.agent_id)
          .eq("owner_id", call.owner_id)
          .maybeSingle();
        const expected = ((agent?.asterisk_webhook_secret as string | null) || "").trim();
        if (!expected || agent?.telephony_provider !== "asterisk") return unauthorized();
        if (!safeEqual(supplied, expected)) return unauthorized();

        // 3) upload — путь включает owner_id для будущих RLS/ретеншен-политик на bucket call-recordings.
        const ext = (file.name.split(".").pop() || "wav").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `asterisk/${call.owner_id}/${callUuid}.${ext || "wav"}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const up = await supabaseAdmin.storage.from("call-recordings").upload(path, bytes, {
          contentType: file.type || "audio/wav",
          upsert: true,
        });
        if (up.error) return new Response(`Upload failed: ${up.error.message}`, { status: 500 });

        const signed = await supabaseAdmin.storage
          .from("call-recordings")
          .createSignedUrl(path, 60 * 60 * 24 * 30);
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
