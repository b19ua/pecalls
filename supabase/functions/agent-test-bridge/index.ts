// Browser ↔ Gemini Live audio bridge for in-app "Test Call" feature.
// Protocol:
//   Browser → Server:
//     - BINARY frames: raw Int16 PCM, 16 kHz, mono, little-endian
//     - TEXT JSON: { type: "end" }
//   Server → Browser:
//     - BINARY frames: raw Int16 PCM, 24 kHz, mono, little-endian (agent audio)
//     - TEXT JSON: { type: "ready" } | { type: "transcript", role, text } | { type: "error", message }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AVAILABLE_LIVE_AUDIO_MODELS,
  buildLanguageDirective,
  detectPreferredLanguage,
  getLanguageName,
  getModelCandidates,
  sanitizeSystemPrompt,
} from "../_shared/live-config.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

const GEMINI_MODELS = AVAILABLE_LIVE_AUDIO_MODELS;
const GEMINI_WS = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_KEY}`;
const log = (...a: unknown[]) => console.log("[test-bridge]", ...a);

type Ctx = { systemPrompt: string; voice: string; language: string; greeting: string };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent_id") || "";
  const token = url.searchParams.get("token") || "";

  if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
    return new Response("expected websocket", { status: 426 });
  }
  if (!agentId || !token) {
    return new Response("missing agent_id/token", { status: 400 });
  }

  // Verify the user owns this agent.
  const { data: userData, error: userErr } = await supa.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response("unauthorized", { status: 401 });
  }
  const userId = userData.user.id;

  const { data: agent } = await supa
    .from("agents")
    .select("system_prompt, voice, language, greeting, owner_id")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent || agent.owner_id !== userId) {
    return new Response("forbidden", { status: 403 });
  }

  const ctx: Ctx = {
    systemPrompt: agent.system_prompt,
    voice: agent.voice || "Puck",
    language: agent.language || "ru-RU",
    greeting: agent.greeting || "Здравствуйте!",
  };

  const { socket: client, response } = Deno.upgradeWebSocket(req);
  handle(client, ctx).catch((e) => console.error("bridge error", e));
  return response;
});

async function handle(client: WebSocket, ctx: Ctx) {
  let gemini: WebSocket | null = null;
  let geminiReady = false;
  let modelIndex = 0;
  let greeted = false;
  let pending: string[] = [];
  let confirmedLanguage = ctx.language || "ru-RU";

  const sendJSON = (obj: unknown) => {
    if (client.readyState === 1) client.send(JSON.stringify(obj));
  };
  const sendBinary = (bytes: Uint8Array) => {
    if (client.readyState === 1) client.send(bytes);
  };

  const connectGemini = () => {
    const models = getModelCandidates("gemini-3.1-flash-live-preview");
    const model = models[modelIndex] || GEMINI_MODELS[0];
    log("connect Gemini", model);
    gemini = new WebSocket(GEMINI_WS);
    gemini.onopen = () => {
      const langDirective = buildLanguageDirective(ctx.language, ctx.greeting);
      gemini!.send(JSON.stringify({
        setup: {
          model,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              languageCode: ctx.language,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: ctx.voice } },
            },
            thinkingConfig: { thinkingLevel: "minimal" },
          },
          systemInstruction: { parts: [{ text: `${langDirective}\n\n${sanitizeSystemPrompt(ctx.systemPrompt)}` }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: { automaticActivityDetection: {} },
        },
      }));
    };
    gemini.onmessage = async (ev) => {
      try {
        const text = typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text();
        const msg = JSON.parse(text);
        if (msg.setupComplete) {
          geminiReady = true;
          sendJSON({ type: "ready" });
          if (!greeted) {
            greeted = true;
            const lang = getLanguageName(ctx.language);
            gemini!.send(JSON.stringify({
              clientContent: {
                turns: [{
                  role: "user",
                  parts: [{ text: `Say exactly this greeting in ${lang} with no translation and no extra words: "${ctx.greeting}"` }],
                }],
                turnComplete: true,
              },
            }));
          }
          for (const b64 of pending) sendAudioToGemini(b64);
          pending = [];
          return;
        }
        if (msg.serverContent) {
          const parts = msg.serverContent?.modelTurn?.parts || [];
          for (const p of parts) {
            if (p.inlineData?.data) {
              const pcm = b64ToBytes(p.inlineData.data);
              const rate = parseAudioRate(p.inlineData.mimeType) || 24000;
              sendBinary(resampleTo24k(pcm, rate));
            }
          }
          const it = msg.serverContent?.inputTranscription?.text;
          if (it) {
            const detected = detectPreferredLanguage(it, confirmedLanguage);
            if (detected.confidence >= 0.72 && detected.language !== confirmedLanguage) {
              confirmedLanguage = detected.language;
              gemini?.send(JSON.stringify({
                clientContent: {
                  turns: [{ role: "user", parts: [{ text: `User language confirmed: ${getLanguageName(detected.language)} (${detected.language}). Reply only in this language until the user clearly switches.` }] }],
                  turnComplete: false,
                },
              }));
            }
            sendJSON({ type: "transcript", role: "user", text: it });
          }
          const ot = msg.serverContent?.outputTranscription?.text;
          if (ot) sendJSON({ type: "transcript", role: "agent", text: ot });
        } else if (msg.error) {
          log("gemini ERR", JSON.stringify(msg.error));
          sendJSON({ type: "error", message: msg.error?.message || "Gemini error" });
        }
      } catch (e) {
        console.error("gemini parse", e);
      }
    };
    gemini.onerror = (e) => log("gemini ws err", (e as ErrorEvent).message || String(e));
    gemini.onclose = (e) => {
      log("gemini closed", e.code, e.reason);
      geminiReady = false;
        if (!greeted && e.code === 1008 && modelIndex < GEMINI_MODELS.length - 1 && client.readyState === 1) {
        modelIndex += 1;
        setTimeout(connectGemini, 150);
      } else if (client.readyState === 1) {
        sendJSON({ type: "error", message: "Gemini disconnected" });
      }
    };
  };

  const sendAudioToGemini = (b64Pcm16k: string) => {
    if (!gemini || gemini.readyState !== 1) return;
    gemini.send(JSON.stringify({
      realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: b64Pcm16k } },
    }));
  };

  client.onopen = () => log("client connected");
  client.onmessage = (ev) => {
    if (typeof ev.data === "string") {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "end") {
          try { client.close(); } catch { /* noop */ }
        }
      } catch { /* ignore */ }
      return;
    }
    // Binary PCM16 16kHz from browser
    const data = ev.data as ArrayBuffer | Blob;
    if (data instanceof ArrayBuffer) {
      const b64 = bytesToB64(new Uint8Array(data));
      if (geminiReady) sendAudioToGemini(b64);
      else pending.push(b64);
    } else if (data instanceof Blob) {
      data.arrayBuffer().then((buf) => {
        const b64 = bytesToB64(new Uint8Array(buf));
        if (geminiReady) sendAudioToGemini(b64);
        else pending.push(b64);
      });
    }
  };
  client.onclose = () => {
    log("client closed");
    try { gemini?.close(); } catch { /* noop */ }
  };
  client.onerror = (e) => log("client err", (e as ErrorEvent).message || String(e));

  connectGemini();
}

function parseAudioRate(mimeType?: string): number | null {
  const m = mimeType?.match(/rate=(\d+)/i);
  return m ? Number(m[1]) : null;
}

// Linear resample to 24kHz (Gemini usually returns 24kHz already → identity).
function resampleTo24k(pcmBytes: Uint8Array, sourceRate: number): Uint8Array {
  if (sourceRate === 24000) return pcmBytes;
  const inSamples = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
  const ratio = sourceRate / 24000;
  const outLen = Math.floor(inSamples.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(i0 + 1, inSamples.length - 1);
    const frac = srcIdx - i0;
    out[i] = (inSamples[i0] * (1 - frac) + inSamples[i1] * frac) | 0;
  }
  return new Uint8Array(out.buffer);
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
