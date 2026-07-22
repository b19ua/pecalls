// Lunara AudioSocket <-> Gemini Live bridge (on-premise, Deno).
//
// Полностью автономен: НЕ ходит напрямую в Supabase, не требует
// SUPABASE_SERVICE_ROLE_KEY (клиент на Lovable Cloud его получить не может).
// Все чтения/записи в БД идут через публичный REST на Lovable
// (/api/public/bridge/<action>), аутентификация — per-agent webhook secret,
// сгенерированный в UI редактора агента.
//
// AudioSocket-протокол (chan_audiosocket):
//   header = [ type(1), length_be(2), payload(N) ]
//   type: 0x00 terminate | 0x01 UUID | 0x03 DTMF | 0x10 audio | 0xff error
//   audio payload = slin16 (8kHz mono PCM16 LE, 20 мс = 320 байт)
//
// Env:
//   GEMINI_API_KEY          — ключ Google AI Studio
//   LOVABLE_BASE_URL        — https://lunara.now (по умолчанию)
//   LOVABLE_AGENT_ID        — UUID агента из UI Lovable
//   LOVABLE_WEBHOOK_SECRET  — per-agent секрет из UI редактора агента
//   AUDIOSOCKET_PORT        — 8090 по умолчанию
//
// deno-lint-ignore-file no-explicit-any

import { buildGeminiSetupPayload, buildRealtimeAudio, buildToolResponse } from "./shared/live-session.ts";
import { buildSystemText, buildToolDeclarations, type AiCoreCtx, type ToolRow } from "./shared/ai-core.ts";
import { buildKnowledgePreamble, buildPhoneInstructions, getModelCandidates, sanitizeSystemPrompt } from "./shared/live-config.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const LOVABLE_BASE = (Deno.env.get("LOVABLE_BASE_URL") ?? "https://lunara.now").replace(/\/+$/, "");
const AGENT_ID = Deno.env.get("LOVABLE_AGENT_ID") ?? "";
const WEBHOOK_SECRET = Deno.env.get("LOVABLE_WEBHOOK_SECRET") ?? "";
const PORT = Number(Deno.env.get("AUDIOSOCKET_PORT") ?? 8090);

if (!GEMINI_KEY || !AGENT_ID || !WEBHOOK_SECRET) {
  console.error("Missing GEMINI_API_KEY / LOVABLE_AGENT_ID / LOVABLE_WEBHOOK_SECRET");
  Deno.exit(1);
}

const log = (...a: unknown[]) => console.log("[asterisk-bridge]", ...a);

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
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length);
  return out;
}
function b64encode(b: Uint8Array): string {
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < b.length; i += chunk) s += String.fromCharCode(...b.subarray(i, Math.min(i + chunk, b.length)));
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ------------------------- resampling -------------------------
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
function parseAudioRate(mimeType?: string): number | null {
  const m = mimeType?.match(/rate=(\d+)/i);
  return m ? Number(m[1]) : null;
}

// ------------------------- bridge REST client -------------------------
async function bridgeCall(action: string, body: unknown): Promise<any> {
  const r = await fetch(`${LOVABLE_BASE}/api/public/bridge/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Asterisk-Secret": WEBHOOK_SECRET,
      "X-Agent-Id": AGENT_ID,
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`bridge ${action}: ${r.status} ${await r.text().catch(() => "")}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

type ExtCtx = AiCoreCtx & {
  voice: string;
  model: string;
  temperature: number;
  recordCalls: boolean;
  crmFull: null | { url: string; authHeader: string; authValue: string; timeoutMs: number; object1: string; object2: string; object3: string };
  crm2Configured: boolean;
  handoffAriBase: string;
  handoffAriAuth: string;
};

async function loadContext(): Promise<ExtCtx | null> {
  try {
    const ctx = await bridgeCall("context", {});
    return ctx as ExtCtx;
  } catch (e) { log("loadContext", e); return null; }
}

// ------------------------- tool execution -------------------------
function fillTemplate(t: string, args: Record<string, unknown>): string {
  return t.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => args[k] !== undefined ? String(args[k]) : "");
}

async function executeWebhookTool(tool: ToolRow, args: Record<string, unknown>): Promise<unknown> {
  const cfg = tool.config;
  const timeout = Math.min(Math.max(cfg.timeout_ms ?? 8000, 500), 20000);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.auth_header_name && cfg.auth_header_value) headers[cfg.auth_header_name] = cfg.auth_header_value;
  let url = "";
  let method = (cfg.method || "POST").toUpperCase();
  let body: string | undefined;
  const paramMap: Record<string, string> = {};
  for (const p of (cfg.parameters ?? [])) {
    if (p && p.name) paramMap[p.name] = (p.query_key && p.query_key.length > 0) ? p.query_key : p.name;
  }
  const outKey = (k: string) => paramMap[k] ?? k;
  if (tool.type === "webhook") {
    url = cfg.url || "";
    if (method === "GET") { const u = new URL(url); for (const [k, v] of Object.entries(args)) u.searchParams.append(outKey(k), String(v)); url = u.toString(); }
    else body = JSON.stringify(args);
  } else {
    const base = (cfg.base_url || "").replace(/\/+$/, "");
    const path = fillTemplate(cfg.path || "", args);
    url = `${base}${path.startsWith("/") ? path : "/" + path}`;
    if (method === "GET") { const u = new URL(url); for (const [k, v] of Object.entries(args)) u.searchParams.append(outKey(k), String(v)); url = u.toString(); }
    else if (cfg.body_template) body = fillTemplate(cfg.body_template, args);
    else body = JSON.stringify(args);
  }
  try {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(url, { method, headers, body, signal: ctl.signal });
    clearTimeout(tid);
    let txt = await r.text();
    if (txt.length > 60000) txt = txt.slice(0, 60000) + "\n…[truncated]";
    let parsed: unknown = txt;
    try { parsed = JSON.parse(txt); } catch { /* keep text */ }
    return { status: r.status, ok: r.ok, data: parsed, instructions: (cfg.response_hint || "").trim() || "Use ALL relevant fields from `data` to answer the caller." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// CRM1: client hits the client's own on-prem CRM — no Lovable secret involved,
// keep direct fetch here.
async function callCrm1(ctx: ExtCtx, args: Record<string, unknown>): Promise<unknown> {
  const c = ctx.crmFull;
  if (!c) return { ok: false, error: "Данные временно недоступны", reason: "integration_disabled" };
  const phone = String(args.phone_number ?? "").trim();
  if (!phone) return { ok: false, error: "Данные временно недоступны", reason: "missing_phone_number" };
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), Math.min(Math.max(c.timeoutMs, 500), 10000));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (c.authHeader && c.authValue) headers[c.authHeader] = c.authValue;
    const r = await fetch(c.url, { method: "POST", headers, body: JSON.stringify({ phone_number: phone }), signal: ctl.signal });
    const txt = (await r.text()).slice(0, 30000);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(txt); } catch { /* text */ }
    if (!r.ok) return { ok: false, error: "Данные временно недоступны", reason: `http_${r.status}` };
    return {
      ok: true, latency_ms: Date.now() - t0,
      [c.object1]: (parsed as any).object_1 ?? (parsed as any)[c.object1] ?? null,
      [c.object2]: (parsed as any).object_2 ?? (parsed as any)[c.object2] ?? null,
      [c.object3]: (parsed as any).object_3 ?? (parsed as any)[c.object3] ?? null,
      raw: parsed,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: "Данные временно недоступны", reason: msg.includes("abort") ? "timeout" : "network_error" };
  }
}

// CRM2 requires the HMAC secret which lives on Lovable — proxy the call.
const crm2TicketPerCall = new Map<string, number>();
async function callCrm2(callSid: string, args: Record<string, unknown>): Promise<unknown> {
  const rl = crm2TicketPerCall.get(callSid) ?? 0;
  if (rl >= 1) return { ok: false, error: "По этому звонку заявка уже создана.", reason: "rate_limit" };
  try {
    const res = await bridgeCall("crm2", { call_sid: callSid, args });
    if (res?.ok) crm2TicketPerCall.set(callSid, rl + 1);
    return res;
  } catch (e) {
    return { ok: false, error: "Система регистрации заявок временно недоступна", reason: e instanceof Error ? e.message : String(e) };
  }
}

async function logObjection(callSid: string, args: Record<string, unknown>): Promise<unknown> {
  try { return await bridgeCall("objection", { call_sid: callSid, ...args }); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// ------------------------- Gemini Live client -------------------------
type GeminiHandle = {
  send: (json: unknown) => void;
  close: () => void;
  onAudio: (cb: (pcm: Uint8Array, rate: number) => void) => void;
  onTranscript: (cb: (role: "user" | "model", text: string) => void) => void;
  onToolCall: (cb: (id: string, name: string, args: Record<string, unknown>) => void) => void;
  onClose: (cb: (code: number, reason: string) => void) => void;
  onReady: (cb: () => void) => void;
};

function openGemini(ctx: ExtCtx, modelOverride?: string, skipGreeting = false): Promise<GeminiHandle> {
  const model = modelOverride || `models/${ctx.model.replace(/^models\//, "")}`;
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_KEY}`;
  const ws = new WebSocket(url);
  const audioCbs: ((b: Uint8Array, rate: number) => void)[] = [];
  const transCbs: ((r: "user" | "model", t: string) => void)[] = [];
  const toolCbs: ((id: string, name: string, args: Record<string, unknown>) => void)[] = [];
  const closeCbs: ((code: number, reason: string) => void)[] = [];
  const readyCbs: (() => void)[] = [];

  return new Promise((resolve, reject) => {
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      const systemText = buildSystemText(ctx, { sanitizeSystemPrompt, buildKnowledgePreamble, buildPhoneInstructions });
      const tools = buildToolDeclarations(ctx.tools, ctx);
      const setup = buildGeminiSetupPayload({ model, voice: ctx.voice, temperature: ctx.temperature, systemText, tools });
      ws.send(JSON.stringify(setup));
      log("gemini setup sent model=", model, "tools=", tools.length, "skipGreeting=", skipGreeting);
      resolve({
        send: (json) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(json)); },
        close: () => { try { ws.close(); } catch { /* */ } },
        onAudio: (cb) => audioCbs.push(cb),
        onTranscript: (cb) => transCbs.push(cb),
        onToolCall: (cb) => toolCbs.push(cb),
        onClose: (cb) => closeCbs.push(cb),
        onReady: (cb) => readyCbs.push(cb),
      });
    };
    ws.onerror = (e) => reject(e);
    ws.onmessage = (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
      let msg: any;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.setupComplete) { for (const cb of readyCbs) cb(); return; }
      if (msg.serverContent) {
        const parts = msg.serverContent?.modelTurn?.parts ?? [];
        for (const p of parts) {
          if (p.inlineData?.data && p.inlineData.mimeType?.startsWith("audio/")) {
            const bytes = b64decode(p.inlineData.data);
            const rate = parseAudioRate(p.inlineData.mimeType) || 24000;
            for (const cb of audioCbs) cb(bytes, rate);
          }
          if (p.text && !p.thought) for (const cb of transCbs) cb("model", p.text);
        }
        const inTx = msg.serverContent?.inputTranscription?.text;
        if (inTx) for (const cb of transCbs) cb("user", inTx);
        const outTx = msg.serverContent?.outputTranscription?.text;
        if (outTx) for (const cb of transCbs) cb("model", outTx);
      } else if (msg.toolCall) {
        for (const fc of msg.toolCall.functionCalls || []) {
          for (const cb of toolCbs) cb(fc.id, fc.name, fc.args || {});
        }
      }
    };
    ws.onclose = (e) => { for (const cb of closeCbs) cb(e.code, e.reason); };
  });
}

// ------------------------- handoff via ARI setChannelVar -------------------------
async function ariSetHandoff(ctx: ExtCtx, callUuid: string): Promise<{ ok: boolean; target: string | null }> {
  if (!ctx.handoffAriBase || !ctx.handoffAriAuth || !ctx.handoffNumbers.length) return { ok: false, target: null };
  const target = ctx.handoffNumbers[Math.floor(Math.random() * ctx.handoffNumbers.length)];
  try {
    const chList = await fetch(`${ctx.handoffAriBase}/ari/channels`, { headers: { Authorization: ctx.handoffAriAuth } });
    if (!chList.ok) return { ok: false, target };
    const chans: any[] = await chList.json();
    let matched: string | null = null;
    for (const ch of chans) {
      const v = await fetch(`${ctx.handoffAriBase}/ari/channels/${ch.id}/variable?variable=LUNARA_UUID`, { headers: { Authorization: ctx.handoffAriAuth } });
      if (!v.ok) continue;
      const jv = await v.json();
      if (String(jv?.value || "") === callUuid) { matched = ch.id; break; }
    }
    if (!matched) { log("[handoff] channel not found for uuid", callUuid); return { ok: false, target }; }
    const r = await fetch(`${ctx.handoffAriBase}/ari/channels/${matched}/variable?variable=LUNARA_HANDOFF_TARGET&value=${encodeURIComponent(target)}`, { method: "POST", headers: { Authorization: ctx.handoffAriAuth } });
    log("[handoff] set var status=", r.status, "target=", target);
    return { ok: r.ok, target };
  } catch (e) { log("[handoff] ari error", e); return { ok: false, target }; }
}

// ------------------------- connection handling -------------------------
async function handleConn(conn: Deno.Conn) {
  const reader = conn.readable.getReader();
  let buf = new Uint8Array(0);
  let callUuid = "";
  let ctx: ExtCtx | null = null;
  let gemini: GeminiHandle | null = null;
  let geminiReady = false;
  let modelIdx = 0;
  let greetingSent = false;
  const transcript: { role: string; text: string; at: number }[] = [];
  let lastSavedLen = 0;
  let outQueue = new Uint8Array(0);
  let persistTimer: number | null = null;

  const flushOut = () => {
    const FRAME = 320;
    while (outQueue.length >= FRAME) {
      const frame = outQueue.slice(0, FRAME);
      outQueue = outQueue.slice(FRAME);
      conn.write(packFrame(T_AUDIO, frame)).catch(() => { /* */ });
    }
  };

  const persistTranscript = async () => {
    if (!callUuid || transcript.length === lastSavedLen) return;
    lastSavedLen = transcript.length;
    try {
      await bridgeCall("call-transcript", { call_sid: callUuid, transcript: transcript.slice(-500), status: "in_progress" });
    } catch (e) { log("persist", e); }
  };

  const setupHandlers = (h: GeminiHandle) => {
    h.onReady(() => {
      geminiReady = true;
      if (!greetingSent && ctx) {
        greetingSent = true;
        h.send({
          client_content: {
            turns: [{ role: "user", parts: [{ text: `Greet the caller now. Say: "${String(ctx.greeting).slice(0, 200)}"` }] }],
            turn_complete: true,
          },
        });
      }
    });
    h.onAudio((pcm, rate) => {
      const f = pcm16ToFloat(pcm);
      const down = resample(f, rate, 8000);
      outQueue = concat(outQueue, floatToPcm16(down));
      flushOut();
    });
    h.onTranscript((role, text) => {
      transcript.push({ role, text, at: Date.now() });
    });
    h.onToolCall(async (id, name, args) => {
      if (!ctx) return;
      let result: unknown;
      if (name === "log_objection") result = await logObjection(callUuid, args);
      else if (name === "get_local_system_data") result = await callCrm1(ctx, args);
      else if (name === "create_emergency_ticket") result = await callCrm2(callUuid, args);
      else {
        const tool = ctx.tools.find((t) => t.name === name);
        result = tool ? await executeWebhookTool(tool, args) : { error: `unknown tool ${name}` };
      }
      h.send(buildToolResponse(id, name, result));
    });
    h.onClose((code, reason) => {
      geminiReady = false;
      log("gemini closed", code, reason);
      if ((code === 1011 || code === 1008) && ctx) {
        const candidates = getModelCandidates(ctx.model);
        if (modelIdx < candidates.length - 1) modelIdx += 1;
        setTimeout(async () => {
          try {
            const next = await openGemini(ctx!, candidates[modelIdx], true);
            gemini = next;
            setupHandlers(next);
          } catch (e) { log("reconnect fail", e); }
        }, 300);
      }
    });
  };

  const cleanup = async (status: string) => {
    if (persistTimer !== null) clearInterval(persistTimer);
    if (callUuid) {
      await persistTranscript().catch(() => {});
      await bridgeCall("call-finalize", { call_sid: callUuid, status, transcript: transcript.slice(-500) }).catch(() => {});
      if (transcript.length >= 2) {
        void bridgeCall("summary", { call_sid: callUuid, transcript }).catch(() => {});
      }
    }
    try { gemini?.close(); } catch { /* */ }
    try { conn.close(); } catch { /* */ }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf = concat(buf, value!);
      while (buf.length >= 3) {
        const type = buf[0];
        const len = (buf[1] << 8) | buf[2];
        if (buf.length < 3 + len) break;
        const payload = buf.slice(3, 3 + len);
        buf = buf.slice(3 + len);

        if (type === T_UUID) {
          callUuid = payload.length === 16 ? uuidBytesToString(payload) : new TextDecoder().decode(payload);
          log("call", callUuid, "connected");
          // Load context first — we need handoffAriBase/handoffAriAuth to fetch caller id.
          ctx = await loadContext();
          if (!ctx) { log("ctx load failed"); await cleanup("failed"); return; }
          // Определяем direction: исходящие звонки инициируются placeAsteriskCall,
          // который генерирует callUuid через crypto.randomUUID() → строгий формат
          // 8-4-4-4-12. Входящие используют ${UNIQUEID} Asterisk (например
          // "1699999999.42") — не UUID. Для исходящих номер уже сохранён в БД
          // через placeAsteriskCall, ARI round-trip не нужен.
          const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callUuid);
          const direction: "inbound" | "outbound" = isUuidFormat ? "outbound" : "inbound";
          let fromNumber: string | null = null;
          if (direction === "inbound" && ctx.handoffAriBase && ctx.handoffAriAuth) {
            try {
              // Точечный GET канал-переменной LUNARA_CALLERID через ARI.
              // Тот же паттерн аутентификации, что использует ariSetHandoff.
              const chList = await fetch(`${ctx.handoffAriBase}/ari/channels`, { headers: { Authorization: ctx.handoffAriAuth } });
              if (chList.ok) {
                const chans: any[] = await chList.json();
                for (const ch of chans) {
                  const v = await fetch(`${ctx.handoffAriBase}/ari/channels/${ch.id}/variable?variable=LUNARA_UUID`, { headers: { Authorization: ctx.handoffAriAuth } });
                  if (!v.ok) continue;
                  const jv = await v.json();
                  if (String(jv?.value || "") !== callUuid) continue;
                  const cv = await fetch(`${ctx.handoffAriBase}/ari/channels/${ch.id}/variable?variable=LUNARA_CALLERID`, { headers: { Authorization: ctx.handoffAriAuth } });
                  if (cv.ok) {
                    const cvj = await cv.json();
                    const val = String(cvj?.value || "").trim();
                    if (val) fromNumber = val;
                  }
                  break;
                }
              }
              if (!fromNumber) log("[caller-id] not resolved for", callUuid, "— continuing without from_number");
            } catch (e) {
              log("[caller-id] ARI lookup failed, continuing without from_number:", e);
            }
          }
          const initBody: Record<string, unknown> = { call_sid: callUuid, direction };
          if (fromNumber) initBody.from_number = fromNumber;
          const init = await bridgeCall("call-init", initBody).catch(() => null);
          if (!init?.agent_id) { log("no agent"); await cleanup("failed"); return; }
          const candidates = getModelCandidates(ctx.model);
          gemini = await openGemini(ctx, candidates[modelIdx]);
          setupHandlers(gemini);
          persistTimer = setInterval(() => { void persistTranscript(); }, 3000) as unknown as number;
        } else if (type === T_AUDIO) {
          if (!gemini || !geminiReady) continue;
          const f = pcm16ToFloat(payload);
          const up = resample(f, 8000, 16000);
          gemini.send(buildRealtimeAudio(b64encode(floatToPcm16(up))));
        } else if (type === T_DTMF) {
          const digit = new TextDecoder().decode(payload);
          log("DTMF", digit);
          transcript.push({ role: "dtmf", text: digit, at: Date.now() });
          if (ctx?.handoffEnabled && String(ctx.handoffDigit || "") === digit) {
            const { ok, target } = await ariSetHandoff(ctx, callUuid);
            if (ok) {
              await bridgeCall("call-handoff", { call_sid: callUuid, handoff_to: target }).catch(() => {});
            }
            try { await conn.write(packFrame(T_TERM, new Uint8Array())); } catch { /* */ }
            break;
          }
        } else if (type === T_TERM) {
          log("terminated by Asterisk");
          break;
        } else if (type === T_ERROR) {
          log("error frame", payload[0]?.toString(16));
        }
      }
    }
  } catch (e) {
    log("conn error", e);
  } finally {
    await cleanup("completed");
  }
}

// ------------------------- listener -------------------------
const listener = Deno.listen({ port: PORT });
log(`AudioSocket listening on :${PORT}  (agent=${AGENT_ID.slice(0, 8)}…, lovable=${LOVABLE_BASE})`);
for await (const conn of listener) { handleConn(conn).catch((e) => log("handle err", e)); }
