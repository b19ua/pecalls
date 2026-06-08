import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyTwilioRequest } from "@/lib/twilio-verify.server";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

async function downloadRecording(recordingSid: string): Promise<ArrayBuffer> {
  const lov = process.env.LOVABLE_API_KEY!;
  const tw = process.env.TWILIO_API_KEY!;
  const r = await fetch(`${GATEWAY}/Recordings/${recordingSid}.mp3`, {
    headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": tw },
  });
  if (!r.ok) throw new Error(`Recording download failed: ${r.status}`);
  return await r.arrayBuffer();
}

async function verifyRecordingWithTwilio(recordingSid: string, callSid: string) {
  const lov = process.env.LOVABLE_API_KEY;
  const tw = process.env.TWILIO_API_KEY;
  if (!lov || !tw || !recordingSid || !callSid) return false;
  try {
    const r = await fetch(`${GATEWAY}/Recordings/${recordingSid}.json`, {
      headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": tw },
    });
    if (!r.ok) return false;
    const data = await r.json() as { call_sid?: string; status?: string };
    return data.call_sid === callSid && data.status === "completed";
  } catch {
    return false;
  }
}

async function transcribeWithGemini(audio: ArrayBuffer, language: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return "";
  const bytes = new Uint8Array(audio);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: `Транскрибируй этот звонок (язык: ${language}). Каналы: 1 — клиент, 2 — агент. Верни диалог в формате:\nСпикер: текст\nБез комментариев, только транскрипт.` },
            { inlineData: { mimeType: "audio/mp3", data: b64 } },
          ],
        }],
      }),
    },
  );
  if (!r.ok) {
    const t = await r.text();
    console.error("[recording] transcription failed", r.status, t);
    return "";
  }
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? "";
}

export const Route = createFileRoute("/api/public/twilio/recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const callSid = String(form.get("CallSid") ?? "");
        const recordingSid = String(form.get("RecordingSid") ?? "");
        const recordingUrl = String(form.get("RecordingUrl") ?? "");
        const status = String(form.get("RecordingStatus") ?? "");
        const duration = Number(form.get("RecordingDuration") ?? 0);

        const signatureOk = await verifyTwilioRequest(request, form);
        if (!signatureOk) {
          const providerVerified = await verifyRecordingWithTwilio(recordingSid, callSid);
          if (!providerVerified) {
            console.error("[recording] invalid signature", { callSid, recordingSid, url: request.url });
            return new Response("Invalid signature", { status: 403 });
          }
          console.warn("[recording] accepted via Twilio API fallback", { callSid, recordingSid });
        }

        if (!callSid || !recordingSid || status !== "completed") {
          return new Response("ok");
        }

        const { data: call } = await supabaseAdmin
          .from("calls")
          .select("id, owner_id, agent_id, agents(language)")
          .eq("twilio_call_sid", callSid)
          .maybeSingle();

        if (!call) {
          console.warn("[recording] call not found", callSid);
          const bySid = await fetch(`${GATEWAY}/Recordings/${recordingSid}.mp3`, {
            headers: {
              Authorization: `Bearer ${process.env.LOVABLE_API_KEY!}`,
              "X-Connection-Api-Key": process.env.TWILIO_API_KEY!,
            },
          }).catch(() => null);
          console.warn("[recording] lookup miss, recording reachable=", !!bySid?.ok);
          return new Response("ok");
        }

        const {
          getResidencyConfig,
          callGateway,
          isSelfHosted,
          deleteTwilioRecording,
        } = await import("@/lib/data-residency.server");
        const cfg = await getResidencyConfig(call.owner_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lang = ((call as any).agents?.language as string) || "ru-RU";

        if (isSelfHosted(cfg)) {
          // Hand off to client's gateway. Gateway pulls audio from Twilio with its own creds.
          const handoff = await callGateway(cfg, "POST", "/calls/ingest", {
            call_id: call.id,
            twilio_call_sid: callSid,
            recording_sid: recordingSid,
            recording_url: `${recordingUrl}.mp3`,
            duration_seconds: duration,
            language: lang,
          });
          await supabaseAdmin
            .from("calls")
            .update({
              data_residency: "self_hosted",
              external_call_ref: call.id,
              ...(duration ? { duration_seconds: duration } : {}),
            })
            .eq("id", call.id);

          if (!handoff.ok) {
            console.error("[recording] gateway handoff failed", handoff.status, handoff.error);
            return new Response("ok");
          }

          // Zero-retention: after gateway ACK, delete the recording from Twilio.
          // Done synchronously so any failure is logged, but does not affect the webhook response.
          if (cfg.purge_twilio_after_ingest !== false) {
            const del = await deleteTwilioRecording(recordingSid);
            if (!del.ok) {
              console.error("[recording] twilio delete failed", del.status, del.error);
            }
          }
          return new Response("ok");
        }

        // Cloud mode: download from Twilio and store in Supabase Storage.
        let storagePath: string | null = null;
        let uploadOk = false;
        try {
          const audio = await downloadRecording(recordingSid);
          const path = `${call.owner_id}/${call.id}/${recordingSid}.mp3`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("call-recordings")
            .upload(path, new Uint8Array(audio), { contentType: "audio/mpeg", upsert: true });
          if (upErr) throw upErr;
          storagePath = path;
          uploadOk = true;

          await supabaseAdmin
            .from("calls")
            .update({
              recording_path: storagePath,
              recording_url: `${recordingUrl}.mp3`,
              recording_status: "ready",
              recording_error: null,
              ...(duration ? { duration_seconds: duration } : {}),
            })
            .eq("id", call.id);

          const transcript = await transcribeWithGemini(audio, lang);
          if (transcript) {
            const { data: latest } = await supabaseAdmin
              .from("calls")
              .select("transcript")
              .eq("id", call.id)
              .maybeSingle();
            const existingTranscript = Array.isArray(latest?.transcript) ? latest.transcript : [];
            if (existingTranscript.length === 0) {
              await supabaseAdmin
                .from("calls")
                .update({ transcript: [{ source: "gemini", text: transcript, at: new Date().toISOString() }] })
                .eq("id", call.id);
            }
          }
        } catch (e) {
          console.error("[recording] processing failed", e);
          await supabaseAdmin
            .from("calls")
            .update({
              recording_url: `${recordingUrl}.mp3`,
              recording_status: "failed",
              recording_error: String(e).slice(0, 500),
            })
            .eq("id", call.id);
        }

        // Zero-retention for cloud mode: only delete from Twilio after our copy is safe.
        if (uploadOk && cfg?.purge_twilio_after_ingest === true) {
          const del = await deleteTwilioRecording(recordingSid);
          if (!del.ok) console.error("[recording] twilio delete failed", del.status, del.error);
        }

        return new Response("ok");
      },
    },
  },
});
