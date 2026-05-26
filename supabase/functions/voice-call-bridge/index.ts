// Twilio Media Streams ↔ Gemini Live audio bridge.
// Twilio sends μ-law 8kHz, Gemini wants PCM16 16kHz; Gemini returns PCM16 24kHz, Twilio wants μ-law 8kHz.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const TWILIO_KEY = Deno.env.get("TWILIO_API_KEY") || "";
const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";
const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

// Order matters: native-audio-latest is the only stable native-audio model in v1beta today,
// fall back to the half-cascade live model if it is unavailable.
const GEMINI_MODELS = [
  "models/gemini-2.5-flash-native-audio-latest",
  "models/gemini-2.0-flash-live-001",
  "models/gemini-3.1-flash-live-preview",
];
const GEMINI_WS = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_KEY}`;
const log = (...a: unknown[]) => console.log("[bridge]", ...a);

Deno.serve((req) => {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent_id") || "";
  const callSid = url.searchParams.get("call_sid") || "";
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("expected WebSocket upgrade", { status: 426 });
  }
  const requested = req.headers.get("sec-websocket-protocol") || "";
  const wantTwilio = requested.split(",").map((s) => s.trim()).includes("audio.twilio.com");
  const upgradeOpts = wantTwilio ? { protocol: "audio.twilio.com" } : undefined;
  const { socket: twilio, response } = Deno.upgradeWebSocket(req, upgradeOpts);
  handle(twilio, agentId, callSid).catch((e) => console.error("bridge error", e));
  return response;
});

type Ctx = {
  agentId: string;
  ownerId: string;
  systemPrompt: string;
  voice: string;
  language: string;
  greeting: string;
  recordCalls: boolean;
  handoffEnabled: boolean;
  handoffDigit: string;
  handoffPhrases: string[];
  handoffNumbers: string[];
};

async function handle(twilio: WebSocket, agentId: string, callSid: string) {
  let streamSid = "";
  let gemini: WebSocket | null = null;
  let geminiReady = false;
  let geminiModelIndex = 0;
  let greetingRequested = false;
  let pendingAudioToGemini: string[] = [];
  const transcript: { role: "user" | "agent"; text: string; ts: string }[] = [];
  let lastUserAudioAt = Date.now();
  let silenceWarned = false;
  let silenceTimer: number | null = null;
  let handoffTriggered = false;
  let recordingStarted = false;
  // RAG state
  let lastRagAt = 0;
  let userBuffer = "";

  let ctx: Ctx | null = null;
  let ctxResolver: ((c: Ctx) => void) | null = null;
  const ctxReady = new Promise<Ctx>((res) => { ctxResolver = res; });

  const connectGemini = () => {
    const model = GEMINI_MODELS[geminiModelIndex] || GEMINI_MODELS[0];
    log("connecting Gemini Live model=", model);
    gemini = new WebSocket(GEMINI_WS);
    gemini.onopen = async () => {
      const c = ctx || await ctxReady;
      const langDirective = `LANGUAGE RULE: Always reply in the SAME language the caller is currently speaking. If they switch language mid-call, switch with them. Default to ${c.language || "ru-RU"} only for the opening greeting before the caller has said anything. Keep replies under 2 short sentences for natural phone dialog.\n\n`;
      gemini!.send(JSON.stringify({
        setup: {
          model,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice || "Puck" } } },
          },
          systemInstruction: { parts: [{ text: langDirective + c.systemPrompt }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
              endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
            },
          },
        },
      }));
    };
    gemini.onmessage = async (ev) => {
      try {
        const text = typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text();
        const msg = JSON.parse(text);
        if (msg.setupComplete) {
          geminiReady = true;
          if (!greetingRequested) {
            greetingRequested = true;
            const c = ctx!;
            gemini!.send(JSON.stringify({
              realtimeInput: {
                text: `[system] The phone call just connected. Say exactly this greeting now, then ask one short open question: "${c.greeting}"`,
              },
            }));
          }
          for (const b64 of pendingAudioToGemini) sendAudioToGemini(b64);
          pendingAudioToGemini = [];
          return;
        }
        if (msg.serverContent) {
          const parts = msg.serverContent?.modelTurn?.parts || [];
          for (const p of parts) {
            if (p.inlineData?.data) {
              const pcm = b64ToBytes(p.inlineData.data);
              const rate = parseAudioRate(p.inlineData.mimeType) || 24000;
              sendMulawToTwilio(pcmToMulaw8k(pcm, rate));
            } else if (p.text && !p.thought) {
              transcript.push({ role: "agent", text: p.text, ts: new Date().toISOString() });
            }
          }
          const it = msg.serverContent?.inputTranscription?.text;
          if (it) {
            transcript.push({ role: "user", text: it, ts: new Date().toISOString() });
            maybeHandoffByPhrase(it);
            // Accumulate user speech and trigger RAG opportunistically
            userBuffer = (userBuffer + " " + it).slice(-600);
            void maybeInjectRag(it);
          }
          const ot = msg.serverContent?.outputTranscription?.text;
          if (ot) transcript.push({ role: "agent", text: ot, ts: new Date().toISOString() });
        } else if (msg.error) {
          log("gemini ERROR", JSON.stringify(msg.error));
          void reportError({
            source: "voice-call-bridge:gemini",
            message: msg.error?.message || "Gemini error",
            context: { error: msg.error, model: GEMINI_MODELS[geminiModelIndex] },
            agent_id: ctx?.agentId,
            call_sid: callSid,
            owner_id: ctx?.ownerId,
          });
        }
      } catch (e) {
        console.error("gemini parse", e);
      }
    };
    gemini.onerror = (e) => log("gemini ERROR", (e as ErrorEvent).message || String(e));
    gemini.onclose = (e) => {
      log("gemini CLOSED", e.code, e.reason);
      geminiReady = false;
      const fatalReason = (e.reason || "").toLowerCase();
      const isPrepayment = e.code === 1011 || fatalReason.includes("prepayment") || fatalReason.includes("quota") || fatalReason.includes("billing");
      if (isPrepayment) {
        void reportError({
          source: "voice-call-bridge:gemini",
          severity: "critical",
          message: `Gemini connection closed (${e.code}): ${e.reason || "no reason"}`,
          context: { code: e.code, reason: e.reason, model: GEMINI_MODELS[geminiModelIndex] },
          agent_id: ctx?.agentId,
          call_sid: callSid,
          owner_id: ctx?.ownerId,
        });
      }
      // Reconnect mid-call too: native-audio models sometimes drop with 1011
      // after ~1 minute. Skip greeting on resume so the caller doesn't hear it twice.
      if (twilio.readyState === 1 && (e.code === 1008 || e.code === 1011)) {
        if (!greetingRequested && geminiModelIndex < GEMINI_MODELS.length - 1) {
          geminiModelIndex += 1;
        }
        // keep greetingRequested=true on mid-call drop → resumed session stays silent until user speaks
        setTimeout(connectGemini, 200);
      }
    };
  };

  // Forward every Twilio audio frame to Gemini. Gemini's server-side VAD
  // handles turn detection — a custom RMS gate here was muting the caller
  // on quieter phone lines after the greeting.
  const sendAudioToGemini = (mulawB64: string) => {
    if (!gemini || gemini.readyState !== 1) return;
    const mulawBytes = b64ToBytes(mulawB64);
    const pcm16k = mulaw8kToPcm16k(mulawBytes);
    lastUserAudioAt = Date.now();
    gemini.send(JSON.stringify({
      realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: bytesToB64(pcm16k) } },
    }));
  };

  // ───────── RAG ─────────
  const maybeInjectRag = async (utterance: string) => {
    if (!ctx || !gemini || gemini.readyState !== 1) return;
    const now = Date.now();
    if (now - lastRagAt < 4500) return; // throttle
    const q = utterance.trim();
    if (q.length < 8) return;
    lastRagAt = now;
    try {
      const emb = await embedText(q);
      if (!emb) return;
      const { data } = await supa.rpc("match_chunks", {
        query_embedding: emb as unknown as string,
        p_agent_id: ctx.agentId,
        p_owner_id: ctx.ownerId,
        match_count: 4,
      });
      const hits = (data ?? []).filter((r: { similarity: number }) => r.similarity > 0.55);
      if (!hits.length) return;
      const ctxText = hits.map((h: { content: string }, i: number) => `[${i + 1}] ${h.content}`).join("\n\n");
      log("RAG hits=", hits.length, "for:", q.slice(0, 60));
      gemini.send(JSON.stringify({
        realtimeInput: {
          text: `[INTERNAL CONTEXT — do not read aloud. Use it to answer the caller's last question precisely. If the answer is not here, say you don't know.]\n\n${ctxText}`,
        },
      }));
    } catch (e) { console.error("rag", e); }
  };

  const checkSilence = () => {
    if (twilio.readyState !== 1) return;
    const idleMs = Date.now() - lastUserAudioAt;
    if (idleMs >= 20_000) {
      try {
        if (gemini && gemini.readyState === 1) {
          gemini.send(JSON.stringify({
            realtimeInput: { text: "[system] Line silent 20s. Say a brief polite goodbye and end the call." },
          }));
        }
      } catch { /* noop */ }
      setTimeout(() => { try { twilio.close(); } catch { /* noop */ } }, 4000);
      if (silenceTimer !== null) { clearInterval(silenceTimer); silenceTimer = null; }
      return;
    }
    if (idleMs >= 8_000 && !silenceWarned) {
      silenceWarned = true;
      try {
        if (gemini && gemini.readyState === 1) {
          gemini.send(JSON.stringify({
            realtimeInput: { text: "[system] Quiet ~8s. Politely re-engage in one short sentence." },
          }));
        }
      } catch { /* noop */ }
    } else if (idleMs < 4_000) {
      silenceWarned = false;
    }
  };

  const sendMulawToTwilio = (mulawBytes: Uint8Array) => {
    if (twilio.readyState !== 1 || !streamSid) return;
    for (let i = 0; i < mulawBytes.length; i += 160) {
      const chunk = mulawBytes.slice(i, Math.min(i + 160, mulawBytes.length));
      twilio.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: bytesToB64(chunk) },
      }));
    }
  };

  const maybeHandoffByPhrase = (text: string) => {
    if (handoffTriggered || !ctx?.handoffEnabled || !ctx.handoffNumbers.length) return;
    const lower = text.toLowerCase();
    const hit = ctx.handoffPhrases.some((p) => p && lower.includes(p.toLowerCase()));
    if (hit) triggerHandoff("phrase");
  };

  const triggerHandoff = async (reason: "dtmf" | "phrase") => {
    if (handoffTriggered || !ctx || !callSid) return;
    if (!ctx.handoffNumbers.length) return;
    handoffTriggered = true;
    const target = ctx.handoffNumbers[Math.floor(Math.random() * ctx.handoffNumbers.length)];
    log("handoff trigger=", reason, "→", target);
    try {
      await supa.from("calls").update({
        handoff_to: target,
        handoff_at: new Date().toISOString(),
      }).eq("twilio_call_sid", callSid);
    } catch (e) { console.error("handoff db", e); }

    const twiml = `<Response><Say voice="alice" language="${ctx.language || "ru-RU"}">Соединяю с оператором.</Say><Dial>${escXml(target)}</Dial></Response>`;
    try {
      const r = await fetch(`${TWILIO_GATEWAY}/Calls/${encodeURIComponent(callSid)}.json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_KEY}`,
          "X-Connection-Api-Key": TWILIO_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Twiml: twiml }),
      });
      if (!r.ok) log("handoff REST failed", r.status, await r.text());
    } catch (e) { console.error("handoff REST", e); }
  };

  const startRecording = async () => {
    if (recordingStarted || !callSid || !LOVABLE_KEY || !TWILIO_KEY) return;
    recordingStarted = true;
    try {
      const r = await fetch(`${TWILIO_GATEWAY}/Calls/${encodeURIComponent(callSid)}/Recordings.json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_KEY}`,
          "X-Connection-Api-Key": TWILIO_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          RecordingChannels: "dual",
          RecordingStatusCallback: `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/voice-call-bridge`,
        }),
      });
      if (!r.ok) log("record REST failed", r.status, await r.text());
      else log("recording started for", callSid);
    } catch (e) { console.error("record REST", e); }
  };

  twilio.onmessage = (ev) => {
    try {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      if (msg.event === "start") {
        streamSid = msg.start?.streamSid || "";
        const params = msg.start?.customParameters || msg.start?.custom_parameters || {};
        if (!agentId && params.agent_id) agentId = params.agent_id;
        if (!callSid && (params.call_sid || msg.start?.callSid)) callSid = params.call_sid || msg.start?.callSid;
        log("twilio START sid=", streamSid, "agent=", agentId, "call=", callSid);
        lastUserAudioAt = Date.now();
        if (silenceTimer === null) silenceTimer = setInterval(checkSilence, 2000) as unknown as number;
        if (!gemini && agentId) startContextAndGemini(agentId);
      } else if (msg.event === "media") {
        const b64 = msg.media?.payload;
        if (!b64) return;
        if (geminiReady) sendAudioToGemini(b64);
        else pendingAudioToGemini.push(b64);
      } else if (msg.event === "dtmf") {
        const digit = String(msg.dtmf?.digit ?? "");
        log("twilio DTMF", digit);
        if (ctx?.handoffEnabled && digit && digit === ctx.handoffDigit) {
          triggerHandoff("dtmf");
        }
      } else if (msg.event === "stop") {
        log("twilio STOP");
        if (silenceTimer !== null) { clearInterval(silenceTimer); silenceTimer = null; }
        twilio.close();
      }
    } catch (e) {
      console.error("twilio parse", e);
    }
  };

  twilio.onclose = async () => {
    if (silenceTimer !== null) { clearInterval(silenceTimer); silenceTimer = null; }
    try { gemini?.close(); } catch { /* noop */ }
    if (callSid && transcript.length) {
      try {
        await supa.from("calls").update({ transcript }).eq("twilio_call_sid", callSid);
      } catch (e) { console.error("save transcript", e); }
      // Generate summary asynchronously
      void generateSummary(callSid, transcript, ctx?.language || "ru-RU");
    }
  };
  twilio.onerror = (e) => log("twilio ERROR", (e as ErrorEvent).message || String(e));

  function startContextAndGemini(id: string) {
    connectGemini();
    loadContext(id).then((loaded) => {
      ctx = loaded;
      log("loaded ctx voice=", loaded.voice, "lang=", loaded.language, "rec=", loaded.recordCalls);
      ctxResolver?.(loaded);
      if (loaded.recordCalls) startRecording();
    }).catch((e) => {
      console.error("load context", e);
      const fb: Ctx = {
        agentId: id, ownerId: "",
        systemPrompt: "Ты вежливый ассистент. Отвечай кратко.",
        voice: "Puck", language: "ru-RU", greeting: "Здравствуйте!",
        recordCalls: false, handoffEnabled: false, handoffDigit: "0",
        handoffPhrases: [], handoffNumbers: [],
      };
      ctx = fb;
      ctxResolver?.(fb);
    });
  }

  if (agentId) startContextAndGemini(agentId);
}

async function loadContext(agentId: string): Promise<Ctx> {
  const { data: agent } = await supa
    .from("agents")
    .select("id, owner_id, system_prompt, voice, language, greeting, record_calls, handoff_enabled, handoff_dtmf_digit, handoff_trigger_phrases, handoff_numbers")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) {
    return {
      agentId, ownerId: "",
      systemPrompt: "Ты вежливый ассистент Premier Energy.",
      voice: "Puck", language: "ru-RU", greeting: "Здравствуйте!",
      recordCalls: false, handoffEnabled: false, handoffDigit: "0",
      handoffPhrases: [], handoffNumbers: [],
    };
  }
  return {
    agentId: agent.id,
    ownerId: agent.owner_id,
    systemPrompt: agent.system_prompt,
    voice: agent.voice || "Puck",
    language: agent.language || "ru-RU",
    greeting: agent.greeting || "Здравствуйте!",
    recordCalls: !!agent.record_calls,
    handoffEnabled: !!agent.handoff_enabled,
    handoffDigit: agent.handoff_dtmf_digit || "0",
    handoffPhrases: Array.isArray(agent.handoff_trigger_phrases) ? agent.handoff_trigger_phrases : [],
    handoffNumbers: Array.isArray(agent.handoff_numbers) ? agent.handoff_numbers : [],
  };
}

async function embedText(text: string): Promise<number[] | null> {
  if (!LOVABLE_KEY) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-embedding-001", input: [text] }),
    });
    if (!r.ok) { log("embed fail", r.status); return null; }
    const j = await r.json();
    return j.data?.[0]?.embedding ?? null;
  } catch (e) { console.error("embed", e); return null; }
}

async function generateSummary(
  callSid: string,
  transcript: { role: string; text: string }[],
  lang: string,
) {
  if (!LOVABLE_KEY || transcript.length < 2) return;
  const langName: Record<string, string> = { "ru-RU": "русском", "en-US": "English", "ro-RO": "română" };
  const ln = langName[lang] || "русском";
  const dialog = transcript.map((m) => `${m.role === "agent" ? "Agent" : "User"}: ${m.text}`).join("\n").slice(0, 8000);
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `Ты — аналитик звонков. Ответь на ${ln} коротко: 1) о чём звонок (1-2 предложения), 2) ключевые факты (буллеты), 3) намерение клиента, 4) следующие шаги. Без воды.` },
          { role: "user", content: dialog },
        ],
      }),
    });
    if (!r.ok) { log("summary fail", r.status); return; }
    const j = await r.json();
    const summary = j.choices?.[0]?.message?.content?.trim();
    const usage = j.usage || {};
    if (summary) {
      await supa.from("calls").update({
        summary,
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
      }).eq("twilio_call_sid", callSid);
      log("summary saved", callSid);
    }
  } catch (e) { console.error("summary", e); }
}

function escXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

async function reportError(payload: {
  source: string;
  severity?: string;
  message: string;
  context?: unknown;
  agent_id?: string;
  call_sid?: string;
  owner_id?: string;
}) {
  try {
    await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/report-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify(payload),
    });
  } catch (e) { console.error("[bridge] reportError failed", e); }
}

// ───────── Audio codecs ─────────
function mulawDecode(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}
function mulawEncode(s: number): number {
  const BIAS = 0x84, CLIP = 32635;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}
function mulaw8kToPcm16k(mulaw: Uint8Array): Uint8Array {
  const out = new Int16Array(mulaw.length * 2);
  let prev = 0;
  for (let i = 0; i < mulaw.length; i++) {
    const cur = mulawDecode(mulaw[i]);
    out[i * 2] = (prev + cur) >> 1;
    out[i * 2 + 1] = cur;
    prev = cur;
  }
  return new Uint8Array(out.buffer);
}
function pcmToMulaw8k(pcmBytes: Uint8Array, sourceRate: number): Uint8Array {
  const samples = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
  const ratio = Math.max(1, Math.round(sourceRate / 8000));
  const outLen = Math.floor(samples.length / ratio);
  const out = new Uint8Array(outLen);
  for (let i = 0, j = 0; j < outLen; i += ratio, j++) {
    let sum = 0;
    for (let k = 0; k < ratio; k++) sum += samples[i + k] | 0;
    out[j] = mulawEncode((sum / ratio) | 0);
  }
  return out;
}
function parseAudioRate(mimeType?: string): number | null {
  const m = mimeType?.match(/rate=(\d+)/i);
  return m ? Number(m[1]) : null;
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(s);
}
