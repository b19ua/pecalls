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

  // Use Buffer for efficient base64 encoding in Node.js/Bun
  const b64 = Buffer.from(audio).toString("base64");

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: `You are transcribing a 2-channel phone call recording (language: ${language}). Channel 1 = caller (CLIENT), Channel 2 = AI agent (AGENT). Transcribe EVERY utterance, including overlapping speech and short interjections from the caller while the agent is talking. For each turn, output exactly one line in the format:\nCLIENT: <text>\nor\nAGENT: <text>\nKeep the original language. Do not add commentary, headers, or timestamps. Do not skip short or unclear caller utterances — transcribe them with [unclear] markers if needed.` },
            { inlineData: { mimeType: "audio/mp3", data: b64 } },
          ],
        }],
        generationConfig: { temperature: 0.1 },
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

function parseSpeakerTranscript(raw: string): Array<{ role: "user" | "agent"; text: string; ts: string }> {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const turns: Array<{ role: "user" | "agent"; text: string; ts: string }> = [];
  const now = new Date().toISOString();
  for (const line of lines) {
    const m = line.match(/^(CLIENT|CALLER|USER|AGENT|ASSISTANT|AI)\s*[:\-–]\s*(.+)$/i);
    if (!m) {
      if (turns.length) turns[turns.length - 1].text += " " + line;
      continue;
    }
    const who = m[1].toUpperCase();
    const role: "user" | "agent" = who === "AGENT" || who === "ASSISTANT" || who === "AI" ? "agent" : "user";
    turns.push({ role, text: m[2].trim(), ts: now });
  }
  return turns;
}

async function analyzeSentimentInline(callId: string) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return;
    const { data: c } = await supabaseAdmin
      .from("calls")
      .select("id, transcript, summary")
      .eq("id", callId)
      .maybeSingle();
    if (!c) return;
    const transcript = (Array.isArray(c.transcript) ? c.transcript : []) as Array<{ role?: string; source?: string; text?: string }>;
    if (!transcript.length) return;
    const text = transcript
      .map((i) => {
        const role = (i?.role ?? i?.source ?? "").toLowerCase();
        const who = role === "agent" || role === "assistant" ? "AGENT" : "CALLER";
        return `${who}: ${(i?.text ?? "").trim()}`;
      })
      .filter((l) => !l.endsWith(":"))
      .join("\n")
      .slice(0, 12000);
    if (!text.trim()) return;
    const sys = "You are a call-center quality analyst. Read the call transcript and return STRICT JSON, no commentary. Keys: sentiment (positive|neutral|negative), sentiment_score (-1..1), complaint_flag (bool), competitor_mentioned (bool), competitor_names (string[]), topics (string[] up to 5 short), short_summary (≤2 sentences in the call's language). Return ONLY the JSON object.";
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts: [{ text: `Summary so far: ${c.summary ?? "(none)"}\n\nTranscript:\n${text}\n\nReturn JSON only.` }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      },
    );
    if (!r.ok) { console.error("[recording] sentiment failed", r.status); return; }
    const j = await r.json();
    const content: string = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}";
    type Analysis = { sentiment?: string; sentiment_score?: number; complaint_flag?: boolean; competitor_mentioned?: boolean; competitor_names?: string[]; topics?: string[]; short_summary?: string };
    let a: Analysis = {};
    try { a = JSON.parse(content) as Analysis; } catch { return; }
    await supabaseAdmin.from("calls").update({
      sentiment: (a.sentiment ?? null) as "positive" | "neutral" | "negative" | null,
      sentiment_score: a.sentiment_score ?? null,
      complaint_flag: a.complaint_flag ?? false,
      competitor_mentioned: a.competitor_mentioned ?? false,
      competitor_names: a.competitor_names ?? [],
      topics: a.topics ?? [],
      analyzed_at: new Date().toISOString(),
      ...(!c.summary && a.short_summary ? { summary: a.short_summary } : {}),
    }).eq("id", callId);
  } catch (e) {
    console.error("[recording] sentiment error", e);
  }
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
              recording_status: "ready", // Mark as ready after handoff
              recording_url: `${recordingUrl}.mp3`,
              ...(duration ? { duration_seconds: duration } : {}),
            })
            .eq("id", call.id);

          if (!handoff.ok) {
            console.error("[recording] gateway handoff failed", handoff.status, handoff.error);
            return new Response("ok");
          }

          // Zero-retention: after gateway ACK, delete the recording from Twilio.
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

          const rawTranscript = await transcribeWithGemini(audio, lang);
          if (rawTranscript) {
            const structured = parseSpeakerTranscript(rawTranscript);
            // Audio-derived transcript is more accurate (captures overlapping
            // speech and final user utterances) — make it canonical, but keep
            // the live one as a fallback if Gemini returned nothing parseable.
            if (structured.length > 0) {
              await supabaseAdmin
                .from("calls")
                .update({ transcript: structured })
                .eq("id", call.id);
            } else {
              const { data: latest } = await supabaseAdmin
                .from("calls")
                .select("transcript")
                .eq("id", call.id)
                .maybeSingle();
              const existingTranscript = Array.isArray(latest?.transcript) ? latest.transcript : [];
              if (existingTranscript.length === 0) {
                await supabaseAdmin
                  .from("calls")
                  .update({ transcript: [{ source: "gemini", text: rawTranscript, at: new Date().toISOString() }] })
                  .eq("id", call.id);
              }
            }
          }
          // Auto-run sentiment / topic / complaint analysis immediately after
          // the recording is processed — no manual button click required.
          await analyzeSentimentInline(call.id);
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

        if (uploadOk && cfg?.purge_twilio_after_ingest === true) {
          const del = await deleteTwilioRecording(recordingSid);
          if (!del.ok) console.error("[recording] twilio delete failed", del.status, del.error);
        }

        return new Response("ok");
      },
    },
  },
});
