// Twilio Media Streams ↔ Gemini Live audio bridge.
// Twilio sends μ-law 8kHz, Gemini wants PCM16 16kHz; Gemini returns PCM16 24kHz, Twilio wants μ-law 8kHz.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AVAILABLE_LIVE_AUDIO_MODELS,
  buildKnowledgePreamble,
  buildPhoneInstructions,
  getModelCandidates,
  sanitizeSystemPrompt,
} from "../_shared/live-config.ts";
import { scanCustomerText, applyFastRed } from "../_shared/risk-keywords.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const TWILIO_KEY = Deno.env.get("TWILIO_API_KEY") || "";
const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";
const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

const GEMINI_MODELS = AVAILABLE_LIVE_AUDIO_MODELS;
const GEMINI_WS = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_KEY}`;
const log = (...a: unknown[]) => console.log("[bridge]", ...a);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent_id") || "";
  const callSid = url.searchParams.get("call_sid") || "";
  const upgrade = req.headers.get("upgrade") || "";
  if (url.searchParams.get("action") === "handoff") return handleHandoffAction(req, url);
  if (url.searchParams.get("action") === "handoff-result") return handleHandoffResult(req, url);
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

type ToolParam = { name: string; type: "string" | "number" | "boolean"; description?: string; required?: boolean };
type ToolRow = {
  id: string;
  type: "webhook" | "crm_lookup" | "crm_write";
  name: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown> & {
    url?: string;
    base_url?: string;
    path?: string;
    method?: string;
    auth_header_name?: string;
    auth_header_value?: string;
    parameters?: ToolParam[];
    body_template?: string;
    timeout_ms?: number;
    response_hint?: string;
  };
};

type Ctx = {
  agentId: string;
  ownerId: string;
  systemPrompt: string;
  knowledgeContext: string;
  voice: string;
  language: string;
  model: string;
  temperature: number;
  greeting: string;
  recordCalls: boolean;
  handoffEnabled: boolean;
  handoffDigit: string;
  handoffPhrases: string[];
  handoffNumbers: string[];
  twilioNumberE164: string;
  outboundMode: "twilio_number" | "sip_trunk";
  sipDomain: string;
  sipUsername: string;
  sipPassword: string;
  sipTransport: string;
  sipFromNumber: string;
  sipRoutePrefix: string;
  tools: ToolRow[];
  objectionEnabled: boolean;
  objectionAaaEnabled: boolean;
  objectionCategories: string[];
  objectionCustomResponses: Record<string, string>;
  emotionTrackingEnabled: boolean;
  crm: {
    enabled: boolean;
    url: string;
    authHeader: string;
    authValue: string;
    timeoutMs: number;
    description: string;
    object1: string;
    object2: string;
    object3: string;
  } | null;
};

const OBJECTION_CATEGORY_LABELS: Record<string, string> = {
  price: "💰 Price / Budget — клиент говорит «дорого», «нет бюджета», «дешевле есть»",
  timing: "⏰ Timing — «не сейчас», «позже», «занят», «перезвоните через месяц»",
  trust: "🤝 Trust / Authority — «кто вы такие», «не слышал о вас», «боюсь обмана»",
  competitor: "🔄 Competitor — «уже работаем с X», «у нас есть решение»",
  stall: "🤔 Stall — «я подумаю», «надо посоветоваться», «пришлите на почту»",
  emotional: "😤 Emotional — раздражение, гнев, разочарование, агрессия",
  clarification: "❓ Clarification — непонимание, нужны уточнения, путаница",
};

function buildObjectionInstructions(c: Ctx): string {
  if (!c.objectionEnabled) return "";
  const cats = (c.objectionCategories || []).filter((k) => OBJECTION_CATEGORY_LABELS[k]);
  const catsBlock = cats.length
    ? cats.map((k) => `  - ${k}: ${OBJECTION_CATEGORY_LABELS[k]}`).join("\n")
    : "  (all categories)";
  const customBlock = Object.entries(c.objectionCustomResponses || {})
    .filter(([k, v]) => cats.includes(k) && String(v || "").trim())
    .map(([k, v]) => `  - ${k}: ${String(v).trim()}`)
    .join("\n");
  const aaa = c.objectionAaaEnabled
    ? `\nALWAYS structure your reply to an objection using the AAA framework:\n  1) ACKNOWLEDGE the feeling in 1 short sentence ("Понимаю, что бюджет важен.")\n  2) ASK one clarifying question to uncover the real reason ("Дорого относительно чего — суммы или окупаемости?")\n  3) ANSWER with a concrete counter-argument (ROI, кейс, рассрочка, гарантия, социальное доказательство).`
    : "";
  const emo = c.emotionTrackingEnabled
    ? `\nEMOTION TRACKING: continuously monitor the caller's tone (calm / curious / hesitant / frustrated / angry / excited / sad). Adapt your pace, warmth and word choice to match. If frustration or anger rises, slow down, lower energy, validate explicitly, and never argue.`
    : "";
  return `\n\n=== DYNAMIC OBJECTION HANDLING ===\nYou are trained to recognise and resolve customer objections in real time. Categories to detect:\n${catsBlock}${aaa}${emo}${customBlock ? `\n\nCUSTOM REBUTTAL HINTS (use these exact angles for the listed categories):\n${customBlock}` : ""}\n\nEvery time the caller voices an objection (or shows strong emotion), you MUST silently call the function \`log_objection\` with: objection_type (one of the categories), raw_quote (caller's exact words), customer_emotion (one word), strategy_used (short: e.g. "AAA+ROI", "social_proof", "discount"), ai_response (a 1-line summary of how you replied), outcome (one of: resolved, booked, lost, followup, unresolved). Call it after you reply. Do NOT mention this tool to the caller.\n=== END OBJECTION HANDLING ===`;
}


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
  let transcriptSaveTimer: number | null = null;
  let lastSavedLen = 0;
  let userPhraseBuffer = ""; // rolling buffer of user speech for phrase matching

  let ctx: Ctx | null = null;
  let ctxResolver: ((c: Ctx) => void) | null = null;
  const ctxReady = new Promise<Ctx>((res) => { ctxResolver = res; });

  const persistTranscript = async () => {
    if (!callSid || transcript.length === lastSavedLen) return;
    lastSavedLen = transcript.length;
    try {
      const { data: row } = await supa.from("calls")
        .update({ transcript, status: "in_progress", source: "ai" })
        .eq("twilio_call_sid", callSid).select("id").maybeSingle();
      if (row?.id) void triggerAnalyze(row.id, "call");
    }
    catch (e) { console.error("live transcript save", e); }
  };

  const triggerAnalyze = async (id: string, kind: "call" | "copilot_session") => {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/analyze-live-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ call_id: id, kind }),
      });
    } catch (e) { console.error("analyze trigger", e); }
  };

  const connectGemini = () => {
    gemini = new WebSocket(GEMINI_WS);
    gemini.onopen = async () => {
      const c = ctx || await ctxReady;
      const lang = c.language || "ru-RU";
      const modelCandidates = getModelCandidates(c.model);
      const model = modelCandidates[geminiModelIndex] || modelCandidates[0] || GEMINI_MODELS[0];
      log("connecting Gemini Live model=", model);
      const phoneInstr = buildPhoneInstructions(lang, c.greeting);
      const knowledgePreamble = buildKnowledgePreamble(c.knowledgeContext);
      const handoffInstr = c.handoffEnabled && c.handoffNumbers.length
        ? `Human handoff rule: if the caller asks for an operator, manager, human, specialist, or transfer, do NOT say that you are transferring immediately and NEVER speak, dictate or read any phone number out loud (the system handles dialing). Just tell the caller in one short sentence to press ${c.handoffDigit || "0"} on the phone keypad to connect to the operator. Do not ask extra questions, do not mention digits other than ${c.handoffDigit || "0"}.`
        : "";
      const objectionInstr = buildObjectionInstructions(c);
      const sysText = [sanitizeSystemPrompt(c.systemPrompt), knowledgePreamble, phoneInstr, handoffInstr, objectionInstr]
        .filter(Boolean)
        .join("\n\n");
      // Lunara-proven payload shape (snake_case, NO languageCode lock).
      const toolDecls = buildToolDeclarations(c.tools, c);
      const setupMsg: Record<string, unknown> = {
        setup: {
          model,
          generation_config: {
            response_modalities: ["AUDIO"],
            temperature: Number.isFinite(c.temperature) ? c.temperature : 0.6,
            max_output_tokens: 2048,
            candidate_count: 1,
            speech_config: {
              voice_config: { prebuilt_voice_config: { voice_name: c.voice || "Aoede" } },
            },
          },
          system_instruction: { parts: [{ text: sysText }] },
          input_audio_transcription: {},
          output_audio_transcription: {},
          realtime_input_config: {
            automatic_activity_detection: {
              disabled: false,
              // HIGH start sensitivity → detect even soft / overlapping caller speech
              // so an interjection while AI is talking still gets transcribed.
              start_of_speech_sensitivity: "START_SENSITIVITY_HIGH",
              // LOW end sensitivity → don't cut caller off mid-sentence.
              end_of_speech_sensitivity: "END_SENSITIVITY_LOW",
              prefix_padding_ms: 300,
              silence_duration_ms: 800,
            },
            activity_handling: "NO_INTERRUPTION",
          },
          ...(toolDecls.length ? { tools: [{ function_declarations: toolDecls }] } : {}),
        },
      };
      gemini!.send(JSON.stringify(setupMsg));
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
            // Lunara-style greeting trigger via client_content turn.
            gemini!.send(JSON.stringify({
              client_content: {
                turns: [{
                  role: "user",
                  parts: [{ text: `Greet the caller now. Say: "${String(c.greeting).slice(0, 200)}"` }],
                }],
                turn_complete: true,
              },
            }));
          }
          for (const b64 of pendingAudioToGemini) sendAudioToGemini(b64);
          pendingAudioToGemini = [];
          return;
        }
        if (msg.serverContent) {
          const it = msg.serverContent?.inputTranscription?.text;
          let handoffPromptIssued = false;
          if (it) {
            transcript.push({ role: "user", text: it, ts: new Date().toISOString() });
            handoffPromptIssued = maybeHandoffByPhrase(it);
            // ── Fast keyword fast-path: instant red without waiting for LLM ──
            const hit = scanCustomerText(it);
            if (hit && ctx?.ownerId) {
              // Need the call row id; persist first to ensure row exists, then flag.
              void (async () => {
                try {
                  await persistTranscript();
                  const { data: row } = await supa.from("calls")
                    .select("id").eq("twilio_call_sid", callSid).maybeSingle();
                  if (row?.id) await applyFastRed(supa, "calls", row.id, ctx!.ownerId, hit, it);
                } catch (e) { console.error("[fast-red call]", e); }
              })();
            }
          }
          const parts = msg.serverContent?.modelTurn?.parts || [];
          if (!handoffPromptIssued) {
            for (const p of parts) {
              if (p.inlineData?.data) {
                const pcm = b64ToBytes(p.inlineData.data);
                const rate = parseAudioRate(p.inlineData.mimeType) || 24000;
                sendMulawToTwilio(pcmToMulaw8k(pcm, rate));
              } else if (p.text && !p.thought) {
                transcript.push({ role: "agent", text: p.text, ts: new Date().toISOString() });
              }
            }
          } else if (parts.length) {
            log("[handoff] suppressed model transfer text; waiting for DTMF");
          }
          const ot = msg.serverContent?.outputTranscription?.text;
          if (ot && !handoffPromptIssued) transcript.push({ role: "agent", text: ot, ts: new Date().toISOString() });
        } else if (msg.error) {
          log("gemini ERROR", JSON.stringify(msg.error));
          const currentModel = getModelCandidates(ctx?.model)[geminiModelIndex] || getModelCandidates(ctx?.model)[0] || GEMINI_MODELS[0];
          void reportError({
            source: "voice-call-bridge:gemini",
            message: msg.error?.message || "Gemini error",
            context: { error: msg.error, model: currentModel },
            agent_id: ctx?.agentId,
            call_sid: callSid,
            owner_id: ctx?.ownerId,
          });
        } else if (msg.toolCall) {
          const calls = msg.toolCall?.functionCalls || [];
          for (const fc of calls) {
            let result: unknown;
            if (fc.name === "log_objection") {
              result = await logObjectionEvent(ctx, callSid, (fc.args || {}) as Record<string, unknown>);
            } else if (fc.name === "get_local_system_data") {
              result = await callLocalCrm(ctx, (fc.args || {}) as Record<string, unknown>, callSid);
            } else {
              const tool = ctx?.tools.find((t) => t.name === fc.name);
              result = tool
                ? await executeTool(tool, (fc.args || {}) as Record<string, unknown>)
                : { error: `unknown tool ${fc.name}` };
            }
            try {
              gemini!.send(JSON.stringify({
                tool_response: {
                  function_responses: [{ id: fc.id, name: fc.name, response: { result } }],
                },
              }));
            } catch (e) { console.error("tool resp", e); }
          }
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
        const model = getModelCandidates(ctx?.model)[geminiModelIndex] || getModelCandidates(ctx?.model)[0] || GEMINI_MODELS[0];
        void reportError({
          source: "voice-call-bridge:gemini",
          severity: "critical",
          message: `Gemini connection closed (${e.code}): ${e.reason || "no reason"}`,
          context: { code: e.code, reason: e.reason, model },
          agent_id: ctx?.agentId,
          call_sid: callSid,
          owner_id: ctx?.ownerId,
        });
      }
      // Reconnect mid-call too: native-audio models sometimes drop with 1011
      // after ~1 minute. Skip greeting on resume so the caller doesn't hear it twice.
      if (twilio.readyState === 1 && (e.code === 1008 || e.code === 1011)) {
        const candidates = getModelCandidates(ctx?.model);
        if (!greetingRequested && geminiModelIndex < candidates.length - 1) {
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
      realtime_input: { audio: { mime_type: "audio/pcm;rate=16000", data: bytesToB64(pcm16k) } },
    }));
  };

  // Language mirroring is handled by Gemini Live native-audio itself —
  // mid-call text injection breaks turn behavior, so we don't do it here.

  const checkSilence = () => {
    if (twilio.readyState !== 1) return;
    const idleMs = Date.now() - lastUserAudioAt;
    // Hang up only after 30s of complete silence from the caller.
    if (idleMs >= 30_000) {
      setTimeout(() => { try { twilio.close(); } catch { /* noop */ } }, 500);
      if (silenceTimer !== null) { clearInterval(silenceTimer); silenceTimer = null; }
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

  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  // Language-segregated defaults — mixed RU+EN ‘human’ false-positives ("human resources") were a problem.
  const DEFAULT_TRIGGERS_RU = ["оператор", "живого оператора", "живой человек", "соедините с человеком", "менеджер", "позови человека"];
  const DEFAULT_TRIGGERS_EN = ["operator", "real person", "speak to a human", "talk to an agent", "human agent"];
  const NEGATIONS = ["не", "не надо", "не нужно", "не хочу", "без", "no", "not", "dont", "don t", "do not", "without"];
  const expandPhrases = (phrases: string[], lang: string) => {
    const defaults = lang === "ru" ? DEFAULT_TRIGGERS_RU : DEFAULT_TRIGGERS_EN;
    return Array.from(new Set([...phrases, ...defaults, "переведи", "переключи", "соедини", "специалист", "специалиста", "человек", "человека"]));
  };
  // Word-boundary match (unicode-aware) + negation guard within last 3 tokens before the hit.
  const matchPhrase = (haystack: string, needle: string): boolean => {
    if (needle.length < 2) return false;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^\\p{L}\\p{N}]|$)`, "u");
    const m = haystack.match(re);
    if (!m) return false;
    const before = haystack.slice(0, m.index ?? 0).split(/\s+/).slice(-3).join(" ");
    return !NEGATIONS.some((n) => new RegExp(`(^|\\s)${n}(\\s|$)`).test(before));
  };
  let handoffPromptedAt = 0;
  const promptForDtmfHandoff = async () => {
    const digit = ctx?.handoffDigit || "0";
    const lang = (ctx?.language || "ru-RU").toLowerCase();
    const promptText = lang.startsWith("ru")
      ? `Чтобы соединиться с оператором, пожалуйста, нажмите ${digit} на клавиатуре телефона.`
      : `To be connected to a human operator, please press ${digit} on your phone keypad.`;
    handoffPromptedAt = Date.now();
    const bridgeWs = `${SUPABASE_URL.replace(/^https?:/, "wss:").replace(/\/$/, "")}/functions/v1/voice-call-bridge`;
    const action = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/voice-call-bridge?action=handoff&agent_id=${encodeURIComponent(ctx?.agentId || agentId)}&call_sid=${encodeURIComponent(callSid)}`;
    const streamUrl = `${bridgeWs}?agent_id=${encodeURIComponent(ctx?.agentId || agentId)}&call_sid=${encodeURIComponent(callSid)}`;
    const twiml = `<Response><Stop><Stream name="gemini"/></Stop><Gather input="dtmf" numDigits="1" timeout="10" action="${escXml(action)}" method="POST"><Say voice="${sayVoiceFor(ctx?.language)}" language="${escXml(ctx?.language || "ru-RU")}">${escXml(promptText)}</Say></Gather><Connect><Stream url="${escXml(streamUrl)}"><Parameter name="agent_id" value="${escXml(ctx?.agentId || agentId)}"/><Parameter name="call_sid" value="${escXml(callSid)}"/></Stream></Connect></Response>`;
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
      if (!r.ok) {
        log("[handoff] prompt REST failed", r.status, await r.text());
        handoffPromptedAt = 0;
      } else {
        log("[handoff] prompted caller to press DTMF", digit);
      }
    } catch (e) { console.error("[handoff] prompt REST error", e); handoffPromptedAt = 0; }
  };
  const maybeHandoffByPhrase = (text: string): boolean => {
    if (handoffTriggered || !ctx?.handoffEnabled || !ctx.handoffNumbers.length) return false;
    // Avoid re-prompting within 20s
    if (handoffPromptedAt && Date.now() - handoffPromptedAt < 20000) return false;
    userPhraseBuffer = (userPhraseBuffer + " " + text).slice(-400);
    const haystack = norm(userPhraseBuffer);
    const lang = (ctx.language || "ru-RU").toLowerCase().startsWith("ru") ? "ru" : "en";
    const phrases = expandPhrases(ctx.handoffPhrases || [], lang);
    const hit = phrases.find((p) => matchPhrase(haystack, norm(p || "")));
    if (hit) {
      log("[handoff] phrase match:", hit, "in:", haystack.slice(-120));
      userPhraseBuffer = "";
      void promptForDtmfHandoff();
      return true;
    }
    return false;
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

    const twiml = `<Response><Stop><Stream name="gemini"/></Stop>${buildHandoffDialTwiml(ctx, target)}</Response>`;
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
      if (!r.ok) {
        log("[handoff] REST failed", r.status, await r.text());
        handoffTriggered = false; // allow retry
      } else {
        log("[handoff] REST ok, dialing", target);
        try { await supa.from("calls").update({ status: "handoff" }).eq("twilio_call_sid", callSid); } catch {}
      }
    } catch (e) { console.error("[handoff] REST error", e); handoffTriggered = false; }
  };

  const startRecording = async () => {
    if (recordingStarted || !callSid || !LOVABLE_KEY || !TWILIO_KEY) return;
    recordingStarted = true;
    const publicBase = Deno.env.get("PUBLIC_APP_URL") || "https://project--d7e8c4a9-917e-4bb2-a113-6e70fdf150da.lovable.app";
    try {
      await supa.from("calls")
        .update({ recording_status: "requested", recording_error: null })
        .eq("twilio_call_sid", callSid);
      const r = await fetch(`${TWILIO_GATEWAY}/Calls/${encodeURIComponent(callSid)}/Recordings.json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_KEY}`,
          "X-Connection-Api-Key": TWILIO_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          RecordingChannels: "dual",
          RecordingStatusCallback: `${publicBase.replace(/\/$/, "")}/api/public/twilio/recording`,
          RecordingStatusCallbackMethod: "POST",
          RecordingStatusCallbackEvent: "completed",
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        log("record REST failed", r.status, body);
        await supa.from("calls")
          .update({ recording_status: "failed", recording_error: `Twilio ${r.status}: ${body.slice(0, 400)}` })
          .eq("twilio_call_sid", callSid);
        void reportError({
          source: "voice-call-bridge:recording",
          severity: "error",
          message: `Twilio ${r.status}: ${body.slice(0, 400)}`,
          context: { status: r.status },
          call_sid: callSid,
          owner_id: ctx?.ownerId,
        });
      } else {
        await supa.from("calls")
          .update({ recording_status: "recording" })
          .eq("twilio_call_sid", callSid);
        log("recording started for", callSid);
      }
    } catch (e) {
      console.error("record REST", e);
      await supa.from("calls")
        .update({ recording_status: "failed", recording_error: String(e).slice(0, 400) })
        .eq("twilio_call_sid", callSid);
    }
  };

  twilio.onmessage = (ev) => {
    try {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      if (msg.event === "start") {
        streamSid = msg.start?.streamSid || "";
        const params = msg.start?.customParameters || msg.start?.custom_parameters || {};
        const paramAgent = params.agent_id ? String(params.agent_id) : "";
        const paramCall = params.call_sid ? String(params.call_sid) : (msg.start?.callSid || "");
        if (!callSid && paramCall) callSid = paramCall;
        // SECURITY: derive agent_id from the calls row keyed by call_sid (Twilio-issued, signed via webhook),
        // not from the WSS query string which is attacker-controllable. Query agent_id only used if no row found.
        if (callSid) {
          void (async () => {
            const { data: callRow } = await supa
              .from("calls")
              .select("agent_id, owner_id")
              .eq("twilio_call_sid", callSid)
              .maybeSingle();
            const trusted = callRow?.agent_id ? String(callRow.agent_id) : "";
            if (trusted) {
              if (paramAgent && paramAgent !== trusted) {
                log("[security] agent_id mismatch query=", paramAgent, "db=", trusted, " — using db");
              }
              if (!agentId || agentId !== trusted) agentId = trusted;
            } else if (!agentId && paramAgent) {
              // No call row yet (rare race) — fall back to query value but mark for re-check.
              agentId = paramAgent;
            }
            log("twilio START sid=", streamSid, "agent=", agentId, "call=", callSid);
            if (!gemini && agentId) startContextAndGemini(agentId);
          })();
        } else {
          if (!agentId && paramAgent) agentId = paramAgent;
          log("twilio START sid=", streamSid, "agent=", agentId, "call=", callSid);
          if (!gemini && agentId) startContextAndGemini(agentId);
        }
        lastUserAudioAt = Date.now();
        if (silenceTimer === null) silenceTimer = setInterval(checkSilence, 2000) as unknown as number;
        if (transcriptSaveTimer === null) transcriptSaveTimer = setInterval(() => { void persistTranscript(); }, 3000) as unknown as number;
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
    if (transcriptSaveTimer !== null) { clearInterval(transcriptSaveTimer); transcriptSaveTimer = null; }
    // Force Gemini to flush any pending inputTranscription for the caller's
    // last utterance before we tear down the WS — otherwise the final user
    // phrase that was still mid-VAD when Twilio dropped gets lost.
    try {
      if (gemini && gemini.readyState === 1) {
        gemini.send(JSON.stringify({
          realtime_input: { activity_end: {} },
        }));
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch { /* noop */ }
    try { gemini?.close(); } catch { /* noop */ }
    if (callSid) {
      try {
        const patch: Record<string, unknown> = {
          status: "completed",
          ended_at: new Date().toISOString(),
        };
        if (transcript.length) patch.transcript = transcript;
        await supa.from("calls").update(patch).eq("twilio_call_sid", callSid);
      } catch (e) { console.error("save transcript / mark ended", e); }
      if (transcript.length) {
        // Generate summary asynchronously
        void generateSummary(callSid, transcript, ctx?.language || "ru-RU");
      }
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
        knowledgeContext: "",
        voice: "Puck", language: "ru-RU", model: "gemini-2.5-flash-native-audio-latest", temperature: 0.6, greeting: "Здравствуйте!",
        recordCalls: false, handoffEnabled: false, handoffDigit: "0",
        handoffPhrases: [], handoffNumbers: [], twilioNumberE164: "",
        outboundMode: "twilio_number", sipDomain: "", sipUsername: "", sipPassword: "", sipTransport: "tls", sipFromNumber: "", sipRoutePrefix: "", tools: [],
       objectionEnabled: false, objectionAaaEnabled: true, objectionCategories: [], objectionCustomResponses: {}, emotionTrackingEnabled: false, crm: null,
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
    .select("id, owner_id, system_prompt, voice, language, model, temperature, greeting, record_calls, handoff_enabled, handoff_dtmf_digit, handoff_trigger_phrases, handoff_numbers, twilio_number_e164, outbound_mode, sip_domain, sip_username, sip_password, sip_transport, sip_from_number, sip_route_prefix, objection_handling_enabled, objection_aaa_enabled, objection_categories, objection_custom_responses, emotion_tracking_enabled")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) {
    return {
      agentId, ownerId: "",
      systemPrompt: "Ты вежливый ассистент Premier Energy.", knowledgeContext: "",
      voice: "Puck", language: "ru-RU", model: "gemini-2.5-flash-native-audio-latest", temperature: 0.6, greeting: "Здравствуйте!",
      recordCalls: false, handoffEnabled: false, handoffDigit: "0",
      handoffPhrases: [], handoffNumbers: [], twilioNumberE164: "",
      outboundMode: "twilio_number", sipDomain: "", sipUsername: "", sipPassword: "", sipTransport: "tls", sipFromNumber: "", sipRoutePrefix: "", tools: [],
      objectionEnabled: false, objectionAaaEnabled: true, objectionCategories: [], objectionCustomResponses: {}, emotionTrackingEnabled: false,
    };
  }
  const knowledgeContext = await loadKnowledgeContext(agent.id, agent.owner_id, `${agent.system_prompt}\n${agent.greeting || ""}`);
  const tools = await loadTools(agent.id, agent.owner_id);
  return {
    agentId: agent.id,
    ownerId: agent.owner_id,
    systemPrompt: agent.system_prompt,
    knowledgeContext,
    voice: agent.voice || "Puck",
    language: agent.language || "ru-RU",
    model: agent.model || "gemini-2.5-flash-native-audio-latest",
    temperature: Number(agent.temperature ?? 0.6),
    greeting: agent.greeting || "Здравствуйте!",
    recordCalls: !!agent.record_calls,
    handoffEnabled: !!agent.handoff_enabled,
    handoffDigit: agent.handoff_dtmf_digit || "0",
    handoffPhrases: Array.isArray(agent.handoff_trigger_phrases) ? agent.handoff_trigger_phrases : [],
    handoffNumbers: Array.isArray(agent.handoff_numbers) ? agent.handoff_numbers : [],
    twilioNumberE164: await resolvePstnCallerId(agent.owner_id, agent.twilio_number_e164 || ""),
    outboundMode: agent.outbound_mode === "sip_trunk" ? "sip_trunk" : "twilio_number",
    sipDomain: agent.sip_domain || "",
    sipUsername: agent.sip_username || "",
    sipPassword: agent.sip_password || "",
    sipTransport: agent.sip_transport || "tls",
    sipFromNumber: agent.sip_from_number || "",
    sipRoutePrefix: agent.sip_route_prefix || "",
    tools,
    objectionEnabled: !!agent.objection_handling_enabled,
    objectionAaaEnabled: agent.objection_aaa_enabled !== false,
    objectionCategories: Array.isArray(agent.objection_categories) ? agent.objection_categories : [],
    objectionCustomResponses: (agent.objection_custom_responses && typeof agent.objection_custom_responses === "object")
      ? agent.objection_custom_responses as Record<string, string>
      : {},
    emotionTrackingEnabled: agent.emotion_tracking_enabled !== false,
  };
}

async function logObjectionEvent(
  ctx: Ctx | null,
  callSid: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!ctx?.ownerId) return { ok: false, error: "no owner" };
  try {
    const row = {
      owner_id: ctx.ownerId,
      agent_id: ctx.agentId,
      call_sid: callSid || null,
      channel: "voice",
      objection_type: String(args.objection_type || "unknown").slice(0, 50),
      raw_quote: args.raw_quote ? String(args.raw_quote).slice(0, 2000) : null,
      customer_emotion: args.customer_emotion ? String(args.customer_emotion).slice(0, 50) : null,
      strategy_used: args.strategy_used ? String(args.strategy_used).slice(0, 200) : null,
      ai_response: args.ai_response ? String(args.ai_response).slice(0, 2000) : null,
      outcome: String(args.outcome || "unresolved").slice(0, 30),
    };
    const { data, error } = await supa.from("objection_events").insert(row).select("id").single();
    if (error) { console.error("log_objection", error); return { ok: false, error: error.message }; }
    log("[objection]", row.objection_type, "/", row.customer_emotion, "→", row.outcome);
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function handleHandoffAction(req: Request, url: URL): Promise<Response> {
  const form = req.method === "POST" ? await req.formData().catch(() => new FormData()) : new FormData();
  const callSid = String(form.get("CallSid") || url.searchParams.get("call_sid") || "");
  const digit = String(form.get("Digits") || "").trim();
  const agentIdParam = String(url.searchParams.get("agent_id") || "");
  const { data: call } = callSid
    ? await supa.from("calls").select("agent_id").eq("twilio_call_sid", callSid).maybeSingle()
    : { data: null };
  const agentId = String(call?.agent_id || agentIdParam || "");
  if (!agentId) return twimlResponse(`<Reject/>`);
  const { data: agent } = await supa
    .from("agents")
    .select("id, owner_id, handoff_enabled, handoff_dtmf_digit, handoff_numbers, twilio_number_e164, language, outbound_mode, sip_domain, sip_username, sip_password, sip_transport, sip_from_number, sip_route_prefix")
    .eq("id", agentId)
    .eq("is_active", true)
    .maybeSingle();
  const expected = String(agent?.handoff_dtmf_digit || "0");
  const numbers = Array.isArray(agent?.handoff_numbers) ? agent.handoff_numbers.filter(Boolean) : [];
  if (!agent?.handoff_enabled || digit !== expected || !numbers.length) {
    return twimlResponse(`<Say voice="${sayVoiceFor(agent?.language as string)}" language="${escXml((agent?.language as string) || "ru-RU")}">Оператор сейчас недоступен.</Say><Hangup/>`);
  }
  const target = String(numbers[Math.floor(Math.random() * numbers.length)]);
  if (callSid) {
    await supa.from("calls")
      .update({ handoff_to: target, handoff_at: new Date().toISOString(), status: "handoff" })
      .eq("twilio_call_sid", callSid);
  }
  const dialCtx = mapAgentToDialCtx(agent);
  dialCtx.twilioNumberE164 = await resolvePstnCallerId(String(agent.owner_id || ""), String(agent.twilio_number_e164 || ""));
  log("[handoff] action dialing", target, "call=", callSid, "digit=", digit);
  return twimlResponse(buildHandoffDialTwiml(dialCtx, target));
}

async function handleHandoffResult(req: Request, url: URL): Promise<Response> {
  const form = req.method === "POST" ? await req.formData().catch(() => new FormData()) : new FormData();
  const callSid = String(form.get("CallSid") || url.searchParams.get("call_sid") || "");
  const result = {
    dial_call_status: String(form.get("DialCallStatus") || ""),
    dial_call_sid: String(form.get("DialCallSid") || ""),
    dial_sip_response_code: String(form.get("DialSipResponseCode") || ""),
    dial_call_duration: String(form.get("DialCallDuration") || ""),
  };
  log("[handoff] dial result", result);
  if (callSid) {
    await supa.from("calls")
      .update({ metadata: { handoff_result: result } })
      .eq("twilio_call_sid", callSid);
  }
  return twimlResponse(`<Hangup/>`);
}

function mapAgentToDialCtx(agent: Record<string, unknown>): Pick<Ctx, "language" | "twilioNumberE164" | "outboundMode" | "sipDomain" | "sipUsername" | "sipPassword" | "sipTransport" | "sipFromNumber" | "sipRoutePrefix"> {
  return {
    language: String(agent.language || "ru-RU"),
    twilioNumberE164: String(agent.twilio_number_e164 || ""),
    outboundMode: agent.outbound_mode === "sip_trunk" ? "sip_trunk" : "twilio_number",
    sipDomain: String(agent.sip_domain || ""),
    sipUsername: String(agent.sip_username || ""),
    sipPassword: String(agent.sip_password || ""),
    sipTransport: String(agent.sip_transport || "tls"),
    sipFromNumber: String(agent.sip_from_number || ""),
    sipRoutePrefix: String(agent.sip_route_prefix || ""),
  };
}

function buildHandoffDialTwiml(c: Pick<Ctx, "language" | "twilioNumberE164" | "outboundMode" | "sipDomain" | "sipUsername" | "sipPassword" | "sipTransport" | "sipFromNumber" | "sipRoutePrefix">, target: string): string {
  // Always dial via Twilio PSTN <Number> for human handoff. Routing the transfer
  // through the customer's SIP trunk frequently fails (403/forbidden, geo / ACL
  // restrictions) and leaves the caller hung up. Twilio PSTN works as long as
  // the Twilio account has voice permissions for the destination country.
  // Only use a callerId that belongs to the connected Twilio account. SIP DID / URI
  // values (for example +37322010026 in a SIP address) are not valid Twilio callerIds
  // and make <Dial><Number> fail immediately with no child call SID.
  const callerIdRaw = c.twilioNumberE164 || "";
  const callerId = callerIdRaw ? ` callerId="${escXml(callerIdRaw)}"` : "";
  const action = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/voice-call-bridge?action=handoff-result`;
  const dialAttrs = `${callerId} answerOnBridge="true" timeout="30" action="${escXml(action)}" method="POST"`;
  const sayLang = escXml(c.language || "ru-RU");
  const sayVoice = sayVoiceFor(c.language);
  log("[handoff] dialing PSTN", target, callerIdRaw ? `callerId=${callerIdRaw}` : "callerId omitted");
  return `<Say voice="${sayVoice}" language="${sayLang}">Соединяю с оператором.</Say><Dial${dialAttrs}><Number>${escXml(target)}</Number></Dial>`;
}

async function resolvePstnCallerId(ownerId: string, preferred: string): Promise<string> {
  const normalizedPreferred = normalizeE164(preferred);
  if (!ownerId) return "";
  try {
    const { data } = await supa
      .from("twilio_numbers")
      .select("phone_e164, capabilities, agent_id")
      .eq("owner_id", ownerId);
    const rows = (data || []) as Array<{ phone_e164?: string | null; capabilities?: Record<string, unknown> | null; agent_id?: string | null }>;
    const voiceNumbers = rows
      .filter((row) => row.capabilities?.voice !== false)
      .map((row) => ({ phone: normalizeE164(row.phone_e164 || ""), agentId: row.agent_id || "" }))
      .filter((row) => !!row.phone);
    if (normalizedPreferred && voiceNumbers.some((row) => row.phone === normalizedPreferred)) return normalizedPreferred;
    return voiceNumbers.find((row) => !row.agentId)?.phone || voiceNumbers[0]?.phone || "";
  } catch (e) {
    console.error("resolve callerId", e);
    return "";
  }
}

function normalizeE164(value: string): string {
  const cleaned = String(value || "").replace(/[^\d+]/g, "");
  return /^\+\d{8,15}$/.test(cleaned) ? cleaned : "";
}


function twimlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

// Twilio <Say> voice that matches the male Gemini voice used in the live stream.
// Polly.Maxim = Russian male; Polly.Matthew = English (US) male.
function sayVoiceFor(language?: string): string {
  const lang = (language || "ru-RU").toLowerCase();
  if (lang.startsWith("ru")) return "Polly.Maxim";
  if (lang.startsWith("en")) return "Polly.Matthew";
  if (lang.startsWith("uk")) return "Polly.Maxim";
  if (lang.startsWith("de")) return "Polly.Hans";
  if (lang.startsWith("fr")) return "Polly.Mathieu";
  if (lang.startsWith("es")) return "Polly.Enrique";
  if (lang.startsWith("it")) return "Polly.Giorgio";
  if (lang.startsWith("pl")) return "Polly.Jacek";
  if (lang.startsWith("pt")) return "Polly.Cristiano";
  return "Polly.Matthew";
}

async function loadTools(agentId: string, ownerId: string): Promise<ToolRow[]> {
  try {
    const { data } = await supa
      .from("agent_tools")
      .select("id, type, name, description, enabled, config")
      .eq("agent_id", agentId)
      .eq("owner_id", ownerId)
      .eq("enabled", true);
    return (data as ToolRow[]) ?? [];
  } catch (e) { console.error("loadTools", e); return []; }
}

function buildToolDeclarations(tools: ToolRow[], ctx?: Ctx) {
  const decls = tools.map((t) => {
    const params = t.config.parameters ?? [];
    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];
    for (const p of params) {
      if (!p.name) continue;
      properties[p.name] = { type: p.type || "string", description: p.description || undefined };
      if (p.required) required.push(p.name);
    }
    return {
      name: t.name,
      description: [t.description, t.config.response_hint].filter(Boolean).join("\n"),
      parameters: { type: "object", properties, required },
    };
  });
  if (ctx?.objectionEnabled) {
    const cats = (ctx.objectionCategories || []).filter((k) => OBJECTION_CATEGORY_LABELS[k]);
    decls.push({
      name: "log_objection",
      description: "Log a customer objection or strong emotion the moment it appears. Call SILENTLY (the caller must not notice) right after you reply to the objection. Used for analytics and to make the agent smarter.",
      parameters: {
        type: "object",
        properties: {
          objection_type: { type: "string", description: `One of: ${(cats.length ? cats : Object.keys(OBJECTION_CATEGORY_LABELS)).join(", ")}` },
          raw_quote: { type: "string", description: "Caller's exact words (verbatim) that expressed the objection." },
          customer_emotion: { type: "string", description: "One word: calm, curious, hesitant, frustrated, angry, excited, sad, neutral." },
          strategy_used: { type: "string", description: "Short tag for the tactic you used, e.g. 'AAA+ROI', 'social_proof', 'discount', 'urgency', 'reframe'." },
          ai_response: { type: "string", description: "One-line summary of how you replied." },
          outcome: { type: "string", description: "One of: resolved, booked, lost, followup, unresolved." },
        },
        required: ["objection_type", "raw_quote", "outcome"],
      },
    });
  }
  if (ctx?.crm?.enabled) {
    const c = ctx.crm;
    decls.push({
      name: "get_local_system_data",
      description: `${c.description}\nSILENTLY call this the moment the caller's phone number is known (or as soon as they identify themselves) to enrich the conversation with CRM data. Returns fields: ${c.object1}, ${c.object2}, ${c.object3}. If the data is temporarily unavailable, continue the dialog naturally without mentioning the tool.`,
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Caller phone number in E.164 if known, otherwise as spoken." },
        },
        required: ["phone_number"],
      },
    });
  }
  return decls;
}

function fillTemplate(tmpl: string, args: Record<string, unknown>): string {
  return tmpl.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) =>
    args[k] !== undefined ? String(args[k]) : "");
}

async function executeTool(tool: ToolRow, args: Record<string, unknown>): Promise<unknown> {
  const cfg = tool.config;
  const timeout = Math.min(Math.max(cfg.timeout_ms ?? 8000, 500), 20000);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.auth_header_name && cfg.auth_header_value) {
    headers[cfg.auth_header_name] = cfg.auth_header_value;
  }
  let url = "";
  let method = (cfg.method || "POST").toUpperCase();
  let body: string | undefined;

  if (tool.type === "webhook") {
    url = cfg.url || "";
    if (method === "GET") {
      const u = new URL(url);
      for (const [k, v] of Object.entries(args)) u.searchParams.set(k, String(v));
      url = u.toString();
    } else {
      body = JSON.stringify(args);
    }
  } else {
    const base = (cfg.base_url || "").replace(/\/+$/, "");
    const path = fillTemplate(cfg.path || "", args);
    url = `${base}${path.startsWith("/") ? path : "/" + path}`;
    if (method === "GET") {
      const u = new URL(url);
      for (const [k, v] of Object.entries(args)) {
        if (!u.searchParams.has(k)) u.searchParams.set(k, String(v));
      }
      url = u.toString();
    } else if (cfg.body_template) {
      body = fillTemplate(cfg.body_template, args);
    } else {
      body = JSON.stringify(args);
    }
  }

  try {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(url, { method, headers, body, signal: ctl.signal });
    clearTimeout(tid);
    let txt = await r.text();
    // Cap at ~60k chars so the full payload reaches the model without
    // breaking the websocket frame. Most APIs return far less.
    if (txt.length > 60000) txt = txt.slice(0, 60000) + "\n…[truncated]";
    let parsed: unknown = txt;
    try { parsed = JSON.parse(txt); } catch { /* keep as text */ }
    log("tool", tool.name, "→", r.status, "bytes:", txt.length);
    return {
      status: r.status,
      ok: r.ok,
      data: parsed,
      instructions:
        (cfg.response_hint || "").trim() ||
        "Use ALL relevant fields from `data` to answer the caller. Read the full payload before replying; do not skip nested objects or arrays.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Live Tool Calling — fetch caller data from the client's local CRM connector over VPN.
 * Isolated: any failure (toggle off, timeout, network error, bad JSON) returns a structured
 * "data unavailable" payload so Gemini keeps the conversation flowing. NEVER throws.
 */
async function callLocalCrm(
  ctx: Ctx | null,
  args: Record<string, unknown>,
  callSid: string,
): Promise<unknown> {
  const c = ctx?.crm;
  log("crm", "toolCall received", "enabled=", !!c?.enabled, "callSid=", callSid, "args=", JSON.stringify(args).slice(0, 200));
  if (!c || !c.enabled) {
    log("crm", "integration disabled at call time → returning unavailable");
    return { ok: false, error: "Данные временно недоступны", reason: "integration_disabled" };
  }
  const phone = String(args.phone_number ?? "").trim();
  if (!phone) {
    log("crm", "missing phone_number arg");
    return { ok: false, error: "Данные временно недоступны", reason: "missing_phone_number" };
  }
  if (!c.url) {
    log("crm", "no CRM url configured");
    return { ok: false, error: "Данные временно недоступны", reason: "no_url" };
  }
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), Math.min(Math.max(c.timeoutMs, 500), 10000));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (c.authHeader && c.authValue) headers[c.authHeader] = c.authValue;
    log("crm", "→ VPN POST", c.url, "phone=", phone, "timeoutMs=", c.timeoutMs);
    const r = await fetch(c.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone_number: phone }),
      signal: ctl.signal,
    });
    clearTimeout(tid);
    let txt = await r.text();
    if (txt.length > 30000) txt = txt.slice(0, 30000) + "\n…[truncated]";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(txt) as Record<string, unknown>; } catch { /* keep as text */ }
    const ms = Date.now() - t0;
    if (!r.ok) {
      log("crm", "← VPN error", r.status, "in", ms, "ms");
      return { ok: false, error: "Данные временно недоступны", reason: `http_${r.status}` };
    }
    // Map provider fields to caller-configured labels so the model gets stable keys.
    const out: Record<string, unknown> = {
      ok: true,
      latency_ms: ms,
      [c.object1]: parsed.object_1 ?? parsed[c.object1] ?? null,
      [c.object2]: parsed.object_2 ?? parsed[c.object2] ?? null,
      [c.object3]: parsed.object_3 ?? parsed[c.object3] ?? null,
      raw: parsed,
      instructions: "Use ALL three returned fields naturally in the conversation; do not read the field names out loud.",
    };
    log("crm", "← VPN ok in", ms, "ms keys=", Object.keys(parsed).join(","));
    return out;
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = msg.includes("abort") || msg.includes("AbortError");
    log("crm", "← VPN fail in", ms, "ms aborted=", aborted, "err=", msg.slice(0, 200));
    return { ok: false, error: "Данные временно недоступны", reason: aborted ? "timeout" : "network_error" };
  }
}



async function gatewayKnowledgeSearch(
  ownerId: string,
  agentId: string,
  queryEmbedding: number[],
): Promise<string | null> {
  try {
    const { data: cfg } = await supa
      .from("data_residency_configs")
      .select("mode,enabled,gateway_url,hmac_secret,sync_knowledge")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!cfg || !cfg.enabled || cfg.mode !== "self_hosted" || !cfg.gateway_url || !cfg.hmac_secret || !cfg.sync_knowledge) {
      return null;
    }
    const path = "/knowledge/search";
    const body = JSON.stringify({ agent_id: agentId, query_embedding: queryEmbedding, k: 12 });
    const ts = Math.floor(Date.now() / 1000).toString();
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(cfg.hmac_secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const macBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}\nPOST\n${path}\n${body}`));
    const sig = Array.from(new Uint8Array(macBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const url = cfg.gateway_url.replace(/\/+$/, "") + path;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lunara-owner": ownerId,
        "x-lunara-timestamp": ts,
        "x-lunara-signature": sig,
      },
      body,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (!r.ok) { log("gateway RAG fail", r.status); return null; }
    const j = await r.json();
    const results = (j?.results ?? []) as Array<{ content: string; similarity: number }>;
    if (!results.length) return "";
    return results
      .filter((row) => Number(row.similarity ?? 0) >= 0.25)
      .map((row) => `- ${String(row.content || "").trim()}`)
      .join("\n")
      .slice(0, 18000);
  } catch (e) {
    log("gateway RAG error", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function loadKnowledgeContext(agentId: string, ownerId: string, seedText: string): Promise<string> {
  try {
    // 1) If the client is self-hosted with sync_knowledge=true, query their gateway first.
    const embedding = await embedText(seedText.slice(0, 3000));
    if (embedding?.length) {
      const remote = await gatewayKnowledgeSearch(ownerId, agentId, embedding);
      if (remote !== null && remote.length > 0) return remote;
    }

    // 2) Cloud fallback: full corpus when small, else local semantic RAG.
    const { data: all } = await supa
      .from("knowledge_chunks")
      .select("content,chunk_index")
      .eq("agent_id", agentId)
      .eq("owner_id", ownerId)
      .order("chunk_index", { ascending: true })
      .limit(200);

    const allText = (all || [])
      .map((row) => String(row.content || "").trim())
      .filter(Boolean)
      .join("\n");

    if (allText.length > 0 && allText.length <= 24000) {
      return allText;
    }

    if (embedding?.length) {
      const { data, error } = await supa.rpc("match_chunks", {
        query_embedding: embedding,
        p_agent_id: agentId,
        p_owner_id: ownerId,
        match_count: 16,
      });
      if (!error && Array.isArray(data) && data.length) {
        return data
          .filter((row) => Number(row.similarity ?? 0) >= 0.3)
          .map((row) => `- ${String(row.content || "").trim()}`)
          .join("\n")
          .slice(0, 18000);
      }
    }

    return allText.slice(0, 18000);
  } catch (error) {
    console.error("knowledge context", error);
    return "";
  }
}

async function embedText(text: string): Promise<number[] | null> {
  if (!GEMINI_KEY) return null;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
        }),
      },
    );
    if (!r.ok) { log("embed fail", r.status, await r.text()); return null; }
    const j = await r.json();
    return j.embedding?.values ?? null;
  } catch (e) { console.error("embed", e); return null; }
}

async function generateSummary(
  callSid: string,
  transcript: { role: string; text: string }[],
  _lang: string,
) {
  if (!GEMINI_KEY || transcript.length < 2) return;
  const dialog = transcript.map((m) => `${m.role === "agent" ? "Agent" : "User"}: ${m.text}`).join("\n").slice(0, 8000);
  const sys = `You are a call analyst. Reply in the SAME language as the dialog below. Output: 1) what the call was about (1-2 sentences), 2) key facts (bullets), 3) caller intent, 4) next steps. No filler.`;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts: [{ text: dialog }] }],
        }),
      },
    );
    if (!r.ok) { log("summary fail", r.status, await r.text()); return; }
    const j = await r.json();
    const summary = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("").trim();
    const usage = j.usageMetadata || {};
    if (summary) {
      await supa.from("calls").update({
        summary,
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0,
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
