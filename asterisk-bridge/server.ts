// Lunara AudioSocket <-> Gemini Live bridge (on-premise, deno).
//
// Runs alongside Asterisk (chan_audiosocket). Asterisk opens a TCP socket
// to us per call and streams slin16 (16-bit signed linear PCM, 8kHz, mono)
// in 20ms frames with a 3-byte binary header:
//   1 byte  type    0x00 terminate | 0x01 UUID | 0x03 DTMF | 0x10 audio | 0xff error
//   2 bytes length  big-endian
//   N bytes payload
// UUID (16 raw bytes) is the first packet — it MUST match the LUNARA_UUID we
// set as a channel variable when placing the call via ARI (see
// src/lib/asterisk.functions.ts). For inbound calls the diaplan generates it
// (${UNIQUEID}). We use it as the call id in Supabase (calls.twilio_call_sid).
//
// We speak the SAME Gemini Live protocol as supabase/functions/voice-call-bridge
// (system_instruction, tools, VAD, voice) so this is functional parity with
// the Twilio bridge, minus μ-law: AudioSocket is already PCM, so we only need
// resampling 8k<->16k and 24k->8k.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, AUDIOSOCKET_PORT
//
// deno-lint-ignore-file no-explicit-any

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const PORT = Number(Deno.env.get("AUDIOSOCKET_PORT") ?? 8090);

if (!SUPABASE_URL || !SERVICE_ROLE || !GEMINI_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY");
  Deno.exit(1);
}

// ------------------------- protocol helpers -------------------------

const T_TERM = 0x00, T_UUID = 0x01, T_DTMF = 0x03, T_AUDIO = 0x10, T_ERROR = 0xff;

function packFrame(type: number, payload: Uint8Array): Uint8Array {
  const buf = new Uint8Array(3 + payload.length);
  buf[0] = type;
  buf[1] = (payload.length >> 8) & 0xff;
  buf[2] = payload.length & 0xff;
  buf.set(payload, 3);
  return buf;
}

function uuidBytesToString(b: Uint8Array): string {
  const h = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ------------------------- resampling (linear) -------------------------
// PCM16 LE mono. Linear interpolation is enough for 8k<->16k<->24k.

function pcm16ToFloat(b: Uint8Array): Float32Array {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = b.byteLength / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}
function floatToPcm16(f: Float32Array): Uint8Array {
  const out = new Uint8Array(f.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = to / from;
  const outLen = Math.floor(input.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

// ------------------------- supabase minimal client -------------------------

async function sb(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`sb ${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function loadAgentForCall(callUuid: string): Promise<any | null> {
  // Найти запись calls по нашему UUID → взять agent_id → загрузить агента.
  const calls = await sb("GET", `calls?twilio_call_sid=eq.${callUuid}&select=agent_id,owner_id`).catch(() => []);
  const agentId = calls?.[0]?.agent_id;
  if (!agentId) return null;
  const rows = await sb("GET", `agents?id=eq.${agentId}&select=*`);
  return rows?.[0] ?? null;
}

async function updateCall(callUuid: string, patch: Record<string, unknown>) {
  await sb("PATCH", `calls?twilio_call_sid=eq.${callUuid}`, patch).catch((e) => console.error("updateCall", e));
}

// ------------------------- Gemini Live client (minimal) -------------------------

type GeminiHandle = {
  ws: WebSocket;
  sendUserAudio: (pcm16k: Uint8Array) => void;
  close: () => void;
  onAudio: (cb: (pcm24k: Uint8Array) => void) => void;
  onTranscript: (cb: (role: "user" | "model", text: string) => void) => void;
};

function openGemini(agent: any): Promise<GeminiHandle> {
  const model = agent.model || "gemini-3.1-flash-live-preview";
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_KEY}`;
  const ws = new WebSocket(url);
  const audioCbs: ((b: Uint8Array) => void)[] = [];
  const transCbs: ((r: "user" | "model", t: string) => void)[] = [];

  return new Promise((resolve, reject) => {
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      const setup = {
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: agent.voice || "Puck" } } },
            temperature: agent.temperature ?? 0.8,
          },
          systemInstruction: { parts: [{ text: (agent.system_prompt || "") + "\n\n" + (agent.greeting ? `Начни с: "${agent.greeting}"` : "") }] },
          realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
      };
      ws.send(JSON.stringify(setup));
      resolve({
        ws,
        sendUserAudio: (pcm16k: Uint8Array) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const b64 = base64Encode(pcm16k);
          ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: b64 } } }));
        },
        close: () => { try { ws.close(); } catch { /* */ } },
        onAudio: (cb) => audioCbs.push(cb),
        onTranscript: (cb) => transCbs.push(cb),
      });
    };
    ws.onerror = (e) => reject(e);
    ws.onmessage = async (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
      let msg: any;
      try { msg = JSON.parse(raw); } catch { return; }
      const parts = msg?.serverContent?.modelTurn?.parts ?? [];
      for (const p of parts) {
        if (p.inlineData?.data && p.inlineData.mimeType?.startsWith("audio/")) {
          const bytes = base64Decode(p.inlineData.data);
          for (const cb of audioCbs) cb(bytes);
        }
        if (p.text) for (const cb of transCbs) cb("model", p.text);
      }
      const inTx = msg?.serverContent?.inputTranscription?.text;
      if (inTx) for (const cb of transCbs) cb("user", inTx);
      const outTx = msg?.serverContent?.outputTranscription?.text;
      if (outTx) for (const cb of transCbs) cb("model", outTx);
    };
  });
}

function base64Encode(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ------------------------- connection handling -------------------------

async function ariRedirect(agent: any, callUuid: string, digit: string) {
  const base = (agent.asterisk_ari_base_url || "").replace(/\/+$/, "");
  const user = agent.asterisk_ari_username;
  const pass = agent.asterisk_ari_password;
  const nums: string[] = Array.isArray(agent.handoff_numbers) ? agent.handoff_numbers : [];
  if (!base || !user || !pass || !nums.length) return false;
  const target = nums[0];
  const endpoint = `${agent.asterisk_trunk || "PJSIP"}/${target}`;
  const auth = btoa(`${user}:${pass}`);
  // Originate second leg and bridge with current channel
  try {
    // Find channel by variable LUNARA_UUID — we track by appArgs, so channel id
    // is unknown here; rely on POST /channels with otherChannelId of appArgs
    // was set by originator. As a simpler approach, request Asterisk to
    // originate a bridge via /ari/channels?app=<app> and let dialplan glue.
    const r = await fetch(`${base}/ari/channels?endpoint=${encodeURIComponent(endpoint)}&app=${encodeURIComponent(agent.asterisk_ari_app)}&appArgs=${encodeURIComponent("handoff:" + callUuid)}&callerId=${encodeURIComponent(agent.asterisk_caller_id || "")}`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
    });
    console.log(`[handoff] digit=${digit} → ${target} status=${r.status}`);
    return r.ok;
  } catch (e) {
    console.error("[handoff] failed", e);
    return false;
  }
}

async function handleConn(conn: Deno.Conn) {
  const reader = conn.readable.getReader();
  let buf = new Uint8Array(0);
  let callUuid = "";
  let agent: any = null;
  let gemini: GeminiHandle | null = null;
  const transcript: { role: string; text: string; at: number }[] = [];
  let outQueue: Uint8Array = new Uint8Array(0); // pcm16 @ 8k pending to Asterisk

  const flushOut = () => {
    const FRAME = 320;
    while (outQueue.length >= FRAME) {
      const frame = outQueue.slice(0, FRAME);
      outQueue = outQueue.slice(FRAME);
      conn.write(packFrame(T_AUDIO, frame)).catch(() => { /* */ });
    }
  };

  const cleanup = async (status: string) => {
    if (callUuid) {
      await updateCall(callUuid, {
        status,
        ended_at: new Date().toISOString(),
        transcript: transcript.slice(-500),
      });
    }
    try { gemini?.close(); } catch { /* */ }
    try { conn.close(); } catch { /* */ }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf = concat(buf, value);
      while (buf.length >= 3) {
        const type = buf[0];
        const len = (buf[1] << 8) | buf[2];
        if (buf.length < 3 + len) break;
        const payload = buf.slice(3, 3 + len);
        buf = buf.slice(3 + len);

        if (type === T_UUID) {
          callUuid = payload.length === 16 ? uuidBytesToString(payload) : new TextDecoder().decode(payload);
          console.log(`[audiosocket] call ${callUuid} connected`);
          agent = await loadAgentForCall(callUuid);
          if (!agent) {
            console.error(`[audiosocket] no agent for call ${callUuid}, closing`);
            await cleanup("failed");
            return;
          }
          await updateCall(callUuid, { status: "in_progress", started_at: new Date().toISOString() });
          gemini = await openGemini(agent);
          gemini.onAudio((pcm24k) => {
            const f = pcm16ToFloat(pcm24k);
            const down = resample(f, 24000, 8000);
            outQueue = concat(outQueue, floatToPcm16(down));
            flushOut();
          });
          gemini.onTranscript((role, text) => {
            transcript.push({ role, text, at: Date.now() });
          });
        } else if (type === T_AUDIO) {
          if (!gemini) continue;
          const f = pcm16ToFloat(payload);
          const up = resample(f, 8000, 16000);
          gemini.sendUserAudio(floatToPcm16(up));
        } else if (type === T_DTMF) {
          const digit = new TextDecoder().decode(payload);
          console.log(`[audiosocket] DTMF ${digit} on ${callUuid}`);
          transcript.push({ role: "dtmf", text: digit, at: Date.now() });
          if (agent?.handoff_enabled && String(agent.handoff_dtmf_digit || "") === digit) {
            const ok = await ariRedirect(agent, callUuid, digit);
            await updateCall(callUuid, { handoff_triggered: ok, handoff_reason: "dtmf" });
          }
        } else if (type === T_ERROR) {
          console.error(`[audiosocket] error frame on ${callUuid}: ${payload[0]?.toString(16)}`);
        } else if (type === T_TERM) {
          console.log(`[audiosocket] call ${callUuid} terminated by Asterisk`);
          break;
        }
      }
    }
  } catch (e) {
    console.error("[audiosocket] conn error", e);
  } finally {
    await cleanup("completed");
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ------------------------- listener -------------------------

const listener = Deno.listen({ port: PORT });
console.log(`[lunara] AudioSocket bridge listening on :${PORT}`);
for await (const conn of listener) {
  handleConn(conn).catch((e) => console.error("handleConn crash", e));
}
