// AI Copilot bridge: silent third-listener for Twilio Media Streams.
// Reads two-leg manager↔customer audio, sends to Gemini Live as analyst,
// inserts realtime suggestions and transcript rows for the dashboard.
//
// Twilio sends μ-law 8 kHz; Gemini Live wants PCM16 16 kHz. We do NOT
// send audio back to Twilio — copilot is read-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

const GEMINI_MODEL = "models/gemini-2.0-flash-live-001";
const GEMINI_WS = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_KEY}`;
const log = (...a: unknown[]) => console.log("[copilot]", ...a);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("expected WebSocket upgrade", { status: 426 });
  }
  const agentId = url.searchParams.get("agent_id") || "";
  const sessionId = url.searchParams.get("session_id") || "";
  const callSid = url.searchParams.get("call_sid") || "";
  const managerName = url.searchParams.get("manager") || "";
  const customerPhone = url.searchParams.get("customer") || "";
  const requested = req.headers.get("sec-websocket-protocol") || "";
  const wantTwilio = requested.split(",").map((s) => s.trim()).includes("audio.twilio.com");
  const upgradeOpts = wantTwilio ? { protocol: "audio.twilio.com" } : undefined;
  const { socket, response } = Deno.upgradeWebSocket(req, upgradeOpts);
  handle(socket, { agentId, sessionId, callSid, managerName, customerPhone }).catch((e) =>
    console.error("copilot bridge error", e),
  );
  return response;
});

type Params = {
  agentId: string;
  sessionId: string;
  callSid: string;
  managerName: string;
  customerPhone: string;
};

type Agent = {
  id: string;
  owner_id: string;
  name: string;
  system_prompt: string;
  language: string;
  enabled: boolean;
  suggestion_categories: string[];
  knowledge_hint: string;
  product_context: string;
  competitor_context: string;
  pricing_context: string;
  emotion_tracking_enabled: boolean;
  objection_handling_enabled: boolean;
  min_suggestion_interval_ms: number;
};

async function loadAgent(agentId: string): Promise<Agent | null> {
  if (!agentId) return null;
  const { data } = await supa.from("copilot_agents").select("*").eq("id", agentId).maybeSingle();
  return data as Agent | null;
}

async function ensureSession(p: Params, agent: Agent): Promise<string> {
  if (p.sessionId) return p.sessionId;
  const { data, error } = await supa
    .from("copilot_sessions")
    .insert({
      owner_id: agent.owner_id,
      agent_id: agent.id,
      call_sid: p.callSid || null,
      customer_phone: p.customerPhone || null,
      manager_name: p.managerName || null,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

function buildSystemPrompt(a: Agent): string {
  const parts = [
    a.system_prompt?.trim() || "",
    a.product_context?.trim() ? `\n=== PRODUCT ===\n${a.product_context.trim()}` : "",
    a.competitor_context?.trim() ? `\n=== COMPETITORS ===\n${a.competitor_context.trim()}` : "",
    a.pricing_context?.trim() ? `\n=== PRICING ===\n${a.pricing_context.trim()}` : "",
    a.knowledge_hint?.trim() ? `\n=== KNOWLEDGE ===\n${a.knowledge_hint.trim()}` : "",
    `\n\nYou are AI Copilot listening silently to a SALES manager (speaker="manager") and a CUSTOMER (speaker="customer").
You do NOT speak. You ONLY emit tools:
- emit_transcript(speaker, text) — for every recognized utterance (short, sentence-level)
- emit_suggestion(category, priority, suggestion_text, trigger_quote, rationale, emotion) — when the manager needs help
Categories allowed: ${(a.suggestion_categories || []).join(", ") || "objection,upsell,emotion,next_step"}.
Priority: high | normal | low.
Language of suggestions: ${a.language}.
Be concise (1–2 short sentences, imperative). Do not repeat the same hint.
Min interval between suggestions: ${a.min_suggestion_interval_ms}ms — skip if too close.`,
  ];
  return parts.filter(Boolean).join("\n");
}

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "emit_transcript",
        description: "Emit a recognized utterance line.",
        parameters: {
          type: "OBJECT",
          properties: {
            speaker: { type: "STRING", enum: ["manager", "customer"] },
            text: { type: "STRING" },
          },
          required: ["speaker", "text"],
        },
      },
      {
        name: "emit_suggestion",
        description: "Emit a real-time hint for the manager.",
        parameters: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING" },
            priority: { type: "STRING", enum: ["high", "normal", "low"] },
            suggestion_text: { type: "STRING" },
            trigger_quote: { type: "STRING" },
            rationale: { type: "STRING" },
            emotion: { type: "STRING" },
          },
          required: ["category", "priority", "suggestion_text"],
        },
      },
    ],
  },
];

// μ-law 8 kHz → PCM16 16 kHz
function muLawToLinear(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 132) << exponent;
  sample -= 132;
  return sign ? -sample : sample;
}
function muLawBytesToPcm16k(buf: Uint8Array): Int16Array {
  const out = new Int16Array(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    const s = muLawToLinear(buf[i]);
    out[i * 2] = s;
    out[i * 2 + 1] = s;
  }
  return out;
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s);
}

async function handle(twilio: WebSocket, p: Params) {
  const agent = await loadAgent(p.agentId);
  if (!agent || !agent.enabled) {
    log("agent missing/disabled", p.agentId);
    twilio.close();
    return;
  }
  const sessionId = await ensureSession(p, agent);
  log("session", sessionId);

  const gemini = new WebSocket(GEMINI_WS);
  let geminiReady = false;
  const pendingAudio: Uint8Array[] = [];
  let lastSuggestionAt = 0;
  let speakerHint: "manager" | "customer" = "manager"; // Twilio sends two tracks; we pass hints in text

  gemini.onopen = () => {
    gemini.send(
      JSON.stringify({
        setup: {
          model: GEMINI_MODEL,
          generationConfig: { responseModalities: ["TEXT"], temperature: 0.4 },
          systemInstruction: { parts: [{ text: buildSystemPrompt(agent) }] },
          tools: TOOLS,
        },
      }),
    );
    geminiReady = true;
    while (pendingAudio.length) {
      const a = pendingAudio.shift()!;
      sendAudioToGemini(a);
    }
  };

  function sendAudioToGemini(pcm16: Uint8Array) {
    gemini.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: b64encode(pcm16) }],
        },
      }),
    );
  }

  gemini.onmessage = async (ev) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer)); } catch { return; }
    const tc = (msg as { toolCall?: { functionCalls?: Array<{ name: string; args: Record<string, unknown>; id?: string }> } }).toolCall;
    if (tc?.functionCalls) {
      for (const fc of tc.functionCalls) {
        try {
          if (fc.name === "emit_transcript") {
            const a = fc.args as { speaker?: string; text?: string };
            if (a.text) {
              await supa.from("copilot_transcript").insert({
                session_id: sessionId,
                owner_id: agent.owner_id,
                speaker: a.speaker || speakerHint,
                text: a.text,
              });
            }
          } else if (fc.name === "emit_suggestion") {
            const now = Date.now();
            if (now - lastSuggestionAt < agent.min_suggestion_interval_ms) {
              log("rate-limited suggestion");
            } else {
              lastSuggestionAt = now;
              const a = fc.args as Record<string, string>;
              await supa.from("copilot_suggestions").insert({
                session_id: sessionId,
                owner_id: agent.owner_id,
                category: a.category || null,
                priority: a.priority || "normal",
                suggestion_text: a.suggestion_text || "",
                trigger_quote: a.trigger_quote || null,
                rationale: a.rationale || null,
                emotion: a.emotion || null,
              });
            }
          }
        } catch (e) { console.error("tool error", e); }
        try {
          gemini.send(JSON.stringify({
            toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { ok: true } }] },
          }));
        } catch { /* noop */ }
      }
    }
  };

  gemini.onerror = (e) => console.error("gemini ws error", e);
  gemini.onclose = () => log("gemini closed");

  twilio.onmessage = (ev) => {
    let data: Record<string, unknown>;
    try { data = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer)); } catch { return; }
    const event = data.event as string;
    if (event === "start") {
      log("twilio start", data.start);
    } else if (event === "media") {
      const media = data.media as { payload: string; track?: string };
      if (media?.track === "outbound") speakerHint = "manager";
      else if (media?.track === "inbound") speakerHint = "customer";
      const pcm = muLawBytesToPcm16k(b64decode(media.payload));
      const bytes = new Uint8Array(pcm.buffer);
      if (geminiReady) sendAudioToGemini(bytes);
      else pendingAudio.push(bytes);
    } else if (event === "stop") {
      log("twilio stop");
      finalize();
    }
  };

  twilio.onclose = () => finalize();
  twilio.onerror = (e) => { console.error("twilio ws error", e); finalize(); };

  let finalized = false;
  async function finalize() {
    if (finalized) return;
    finalized = true;
    try { gemini.close(); } catch { /* noop */ }
    await supa
      .from("copilot_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    log("session ended", sessionId);
  }
}
