// Lunara AudioSocket <-> Gemini Live bridge (on-premise, Deno).
//
// Функциональный паритет с Twilio-мостом (supabase/functions/voice-call-bridge):
//   - loadContext: system_prompt + knowledge (RAG) + tools + objection + CRM + CRM2
//   - системный текст собирается ЕДИНЫМ builder-ом из shared/ai-core.ts
//   - toolCall от Gemini: log_objection, get_local_system_data (CRM1),
//     create_emergency_ticket (CRM2 с HMAC + idempotency + circuit breaker),
//     произвольные webhook-tools из agent_tools
//   - reconnect на code 1011/1008 с моделью-fallback (getModelCandidates)
//   - периодическая запись transcript (каждые 3 сек), а не только в конце
//   - generateSummary после hangup
//   - HAND-OFF через hangup-cause: ставим channel var LUNARA_HANDOFF_TARGET
//     через ARI setChannelVar, потом закрываем AudioSocket → диалплан-контекст
//     lunara-outcome сам делает Dial() (или Hangup()) в зависимости от переменной.
//     Этот подход надёжнее ARI-redirect'а: не требует Stasis-приложения
//     держать состояние, вся логика перевода в extensions.conf клиента.
//
// AudioSocket-протокол (chan_audiosocket):
//   header = [ type(1), length_be(2), payload(N) ]
//   type: 0x00 terminate | 0x01 UUID | 0x03 DTMF | 0x10 audio | 0xff error
//   audio payload = slin16 (8kHz mono PCM16 LE, 20 мс = 320 байт)
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, AUDIOSOCKET_PORT
//   PUBLIC_APP_URL (для triggerAnalyze — опционально)
//
// deno-lint-ignore-file no-explicit-any

import {
  buildGeminiSetupPayload,
  buildRealtimeAudio,
  buildToolResponse,
} from "./shared/live-session.ts";
import {
  buildSystemText,
  buildToolDeclarations,
  OBJECTION_CATEGORY_LABELS,
  type AiCoreCtx,
  type ToolRow,
} from "./shared/ai-core.ts";
import {
  AVAILABLE_LIVE_AUDIO_MODELS,
  buildKnowledgePreamble,
  buildPhoneInstructions,
  getModelCandidates,
  sanitizeSystemPrompt,
} from "./shared/live-config.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const PORT = Number(Deno.env.get("AUDIOSOCKET_PORT") ?? 8090);

if (!SUPABASE_URL || !SERVICE_ROLE || !GEMINI_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY");
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
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
function b64encode(b: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
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

// ------------------------- supabase minimal REST client -------------------------
async function sb(method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`sb ${method} ${path}: ${r.status} ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
async function sbRpc(fn: string, body: unknown): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status}`);
  return r.json();
}

type ExtCtx = AiCoreCtx & {
  voice: string;
  model: string;
  temperature: number;
  recordCalls: boolean;
  crmFull: null | { url: string; authHeader: string; authValue: string; timeoutMs: number; object1: string; object2: string; object3: string };
  crm2Full: null | { url: string; timeoutMs: number; hmacSecret: string };
  handoffAriBase: string;
  handoffAriAuth: string;
};

async function loadContext(agentId: string): Promise<ExtCtx | null> {
  const agents = await sb(
    "GET",
    `agents?id=eq.${agentId}&select=id,owner_id,system_prompt,voice,language,model,temperature,greeting,record_calls,handoff_enabled,handoff_dtmf_digit,handoff_numbers,objection_handling_enabled,objection_aaa_enabled,objection_categories,objection_custom_responses,emotion_tracking_enabled,tools_config,asterisk_ari_base_url,asterisk_ari_username,asterisk_ari_password`,
  );
  const agent = agents?.[0];
  if (!agent) return null;

  const ownerId: string = agent.owner_id;

  // knowledge — облачный fallback (self-hosted RAG в Docker моста намеренно опускаем,
  // клиентский Asterisk-стенд уже локальный, всё в одной инфре).
  const knowledge = await loadKnowledgeContext(agent.id, ownerId, `${agent.system_prompt}\n${agent.greeting || ""}`);

  // agent_tools
  const toolRows: ToolRow[] =
    (await sb(
      "GET",
      `agent_tools?agent_id=eq.${agent.id}&owner_id=eq.${ownerId}&enabled=eq.true&select=id,type,name,description,enabled,config`,
    )) ?? [];

  // CRM конфиг owner-scoped
  const cfgRows = await sb(
    "GET",
    `data_residency_configs?owner_id=eq.${ownerId}&select=crm_enabled,crm_url,crm_auth_header,crm_auth_value,crm_timeout_ms,crm_tool_description,crm_object1_label,crm_object2_label,crm_object3_label,crm2_enabled,crm2_url,crm2_timeout_ms,crm2_system_prompt_template,hmac_secret`,
  );
  const drc = cfgRows?.[0];

  const crmLite = drc?.crm_enabled && drc?.crm_url
    ? { enabled: true, description: drc.crm_tool_description || "Get caller info from local CRM by phone number.", object1: drc.crm_object1_label || "object_1", object2: drc.crm_object2_label || "object_2", object3: drc.crm_object3_label || "object_3" }
    : null;
  const crmFull = drc?.crm_enabled && drc?.crm_url
    ? { url: String(drc.crm_url), authHeader: drc.crm_auth_header || "", authValue: drc.crm_auth_value || "", timeoutMs: Number(drc.crm_timeout_ms ?? 2000), object1: drc.crm_object1_label || "object_1", object2: drc.crm_object2_label || "object_2", object3: drc.crm_object3_label || "object_3" }
    : null;
  const crm2Lite = drc?.crm2_enabled && drc?.crm2_url
    ? { enabled: true, systemPromptTemplate: String(drc.crm2_system_prompt_template || "") }
    : null;
  const crm2Full = drc?.crm2_enabled && drc?.crm2_url
    ? { url: String(drc.crm2_url), timeoutMs: Number(drc.crm2_timeout_ms ?? 3000), hmacSecret: String(drc.hmac_secret || "") }
    : null;

  const ariBase = String(agent.asterisk_ari_base_url || "").replace(/\/+$/, "");
  const ariAuth = agent.asterisk_ari_username && agent.asterisk_ari_password
    ? "Basic " + btoa(`${agent.asterisk_ari_username}:${agent.asterisk_ari_password}`)
    : "";

  return {
    agentId: agent.id,
    ownerId,
    systemPrompt: agent.system_prompt || "",
    knowledgeContext: knowledge,
    language: agent.language || "ru-RU",
    greeting: agent.greeting || "Здравствуйте!",
    handoffEnabled: !!agent.handoff_enabled,
    handoffDigit: agent.handoff_dtmf_digit || "0",
    handoffNumbers: Array.isArray(agent.handoff_numbers) ? agent.handoff_numbers : [],
    tools: toolRows,
    objectionEnabled: !!agent.objection_handling_enabled,
    objectionAaaEnabled: agent.objection_aaa_enabled !== false,
    objectionCategories: Array.isArray(agent.objection_categories) ? agent.objection_categories : [],
    objectionCustomResponses: (agent.objection_custom_responses && typeof agent.objection_custom_responses === "object")
      ? agent.objection_custom_responses as Record<string, string>
      : {},
    emotionTrackingEnabled: agent.emotion_tracking_enabled !== false,
    crm: crmLite,
    crm2: crm2Lite,
    toolsConfig: (agent.tools_config && typeof agent.tools_config === "object" && !Array.isArray(agent.tools_config))
      ? agent.tools_config as Record<string, boolean>
      : {},
    voice: agent.voice || "Aoede",
    model: agent.model || AVAILABLE_LIVE_AUDIO_MODELS[0],
    temperature: Number(agent.temperature ?? 0.6),
    recordCalls: !!agent.record_calls,
    crmFull,
    crm2Full,
    handoffAriBase: ariBase,
    handoffAriAuth: ariAuth,
  };
}

async function embedText(text: string): Promise<number[] | null> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "models/gemini-embedding-001", content: { parts: [{ text }] } }) },
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j.embedding?.values ?? null;
  } catch { return null; }
}
async function loadKnowledgeContext(agentId: string, ownerId: string, seed: string): Promise<string> {
  try {
    const all = await sb("GET", `knowledge_chunks?agent_id=eq.${agentId}&owner_id=eq.${ownerId}&select=content,chunk_index&order=chunk_index.asc&limit=200`);
    const allText = (all || []).map((r: any) => String(r.content || "").trim()).filter(Boolean).join("\n");
    if (allText.length > 0 && allText.length <= 24000) return allText;
    const emb = await embedText(seed.slice(0, 3000));
    if (emb?.length) {
      const res = await sbRpc("match_chunks", { query_embedding: emb, p_agent_id: agentId, p_owner_id: ownerId, match_count: 16 });
      if (Array.isArray(res) && res.length) {
        return res.filter((r: any) => Number(r.similarity ?? 0) >= 0.3).map((r: any) => `- ${String(r.content || "").trim()}`).join("\n").slice(0, 18000);
      }
    }
    return allText.slice(0, 18000);
  } catch (e) { log("knowledge", e); return ""; }
}

// ------------------------- tool execution (mirror Twilio bridge) -------------------------
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
  // Outbound query-key map: honour optional `query_key` override on each
  // configured parameter so APIs with nested/bracketed keys (Bitrix24
  // `filter[PHONE]`, JSON:API `page[size]`, …) work without exposing weird
  // identifiers to the LLM.
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

const crm2TicketPerCall = new Map<string, number>();
type Breaker = { fails: number; openUntil: number };
const crm2Breakers = new Map<string, Breaker>();
const PHONE_RE = /^\+?[0-9]{7,15}$/;
const NLC_RE = /^[0-9]{6,12}$/;

async function callCrm2(ctx: ExtCtx, args: Record<string, unknown>, callSid: string): Promise<unknown> {
  const c = ctx.crm2Full;
  if (!c) return { ok: false, error: "Система регистрации заявок временно недоступна", reason: "integration_disabled" };
  const rl = crm2TicketPerCall.get(callSid) ?? 0;
  if (rl >= 1) return { ok: false, error: "По этому звонку заявка уже создана.", reason: "rate_limit" };
  const bkey = `crm2:${ctx.ownerId}`;
  const bs = crm2Breakers.get(bkey) ?? { fails: 0, openUntil: 0 };
  if (bs.openUntil > Date.now()) return { ok: false, error: "Система регистрации заявок временно недоступна", reason: "breaker_open" };
  const emergency_type = String(args.emergency_type ?? "").trim();
  const phone_number = String(args.phone_number ?? "").trim();
  const nlc_number = String(args.nlc_number ?? "").trim();
  const facility_address = String(args.facility_address ?? "").trim();
  const caller_comment = String(args.caller_comment ?? "").trim();
  const ALLOWED = new Set(["no_light_individual", "no_light_area", "wire_down_danger", "sparking_equipment"]);
  if (!ALLOWED.has(emergency_type)) return { ok: false, error: "Некорректный тип аварии.", reason: "invalid_emergency_type" };
  if (!phone_number || !PHONE_RE.test(phone_number.replace(/[\s\-()]/g, ""))) return { ok: false, error: "Некорректный номер телефона.", reason: "invalid_phone" };
  if (!nlc_number && !facility_address) return { ok: false, error: "Нужен NLC или адрес.", reason: "missing_address_and_nlc" };
  if (nlc_number && !NLC_RE.test(nlc_number)) return { ok: false, error: "Некорректный NLC.", reason: "invalid_nlc" };

  const idempotencyKey = `${callSid}:${emergency_type}:${nlc_number || facility_address}`;
  const bodyObj = { phone_number, nlc_number, facility_address, emergency_type, caller_comment, call_sid: callSid, idempotency_key: idempotencyKey };
  const bodyStr = JSON.stringify(bodyObj);
  const ts = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-CRM-Timestamp": ts, "X-Idempotency-Key": idempotencyKey };
  if (c.hmacSecret) {
    try {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(c.hmacSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${bodyStr}`));
      headers["X-CRM-Signature"] = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch { /* skip */ }
  }
  const timeoutMs = Math.min(Math.max(c.timeoutMs, 1000), 10000);
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(c.url, { method: "POST", headers, body: bodyStr, signal: ctl.signal });
    const txt = (await r.text()).slice(0, 20000);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
    if (r.ok) {
      crm2TicketPerCall.set(callSid, rl + 1);
      crm2Breakers.set(bkey, { fails: 0, openUntil: 0 });
      const externalId = (parsed as any).ticket_id ?? (parsed as any).id ?? null;
      return { ok: true, latency_ms: Date.now() - t0, ticket_id: externalId, data: parsed };
    }
    const nextFails = bs.fails + 1;
    crm2Breakers.set(bkey, { fails: nextFails, openUntil: nextFails >= 5 ? Date.now() + 60_000 : 0 });
    return { ok: false, error: "Система регистрации заявок временно недоступна", reason: `http_${r.status}` };
  } catch (e) {
    const nextFails = bs.fails + 1;
    crm2Breakers.set(bkey, { fails: nextFails, openUntil: nextFails >= 5 ? Date.now() + 60_000 : 0 });
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: "Система регистрации заявок временно недоступна", reason: msg.includes("abort") ? "timeout" : "network_error" };
  }
}

async function logObjection(ctx: ExtCtx, callSid: string, args: Record<string, unknown>): Promise<unknown> {
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
    const res = await sb("POST", "objection_events", row);
    return { ok: true, id: res?.[0]?.id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
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
      const systemText = buildSystemText(ctx, {
        sanitizeSystemPrompt,
        buildKnowledgePreamble,
        buildPhoneInstructions,
      });
      const tools = buildToolDeclarations(ctx.tools, ctx);
      const setup = buildGeminiSetupPayload({
        model, voice: ctx.voice, temperature: ctx.temperature, systemText, tools,
      });
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

// ------------------------- handoff: ARI setChannelVar + AudioSocket TERM -------------------------
// Диалплан-контекст 'lunara-outcome' у клиента должен читать LUNARA_HANDOFF_TARGET:
//   [lunara-outcome]
//   exten => s,1,GotoIf($["${LUNARA_HANDOFF_TARGET}" = ""]?end)
//    same => n,Dial(PJSIP/${LUNARA_HANDOFF_TARGET}@${LUNARA_TRUNK},30,g)
//    same => n(end),Hangup()
// Мы просто:
//  1) находим канал в ARI по channelvar LUNARA_UUID
//  2) ставим LUNARA_HANDOFF_TARGET через ARI
//  3) закрываем AudioSocket (0x00 TERM) — диалплан продолжает следующей приорити,
//     которая делает Goto(lunara-outcome,s,1). Полностью надёжно: даже если ARI
//     недоступен, AudioSocket закроется и Asterisk сам сделает Hangup — звонок
//     не зависнет.
async function ariSetHandoff(ctx: ExtCtx, callUuid: string): Promise<boolean> {
  if (!ctx.handoffAriBase || !ctx.handoffAriAuth || !ctx.handoffNumbers.length) return false;
  const target = ctx.handoffNumbers[Math.floor(Math.random() * ctx.handoffNumbers.length)];
  try {
    // Найти channel_id по переменной LUNARA_UUID (перебор активных каналов — их мало).
    const chList = await fetch(`${ctx.handoffAriBase}/ari/channels`, { headers: { Authorization: ctx.handoffAriAuth } });
    if (!chList.ok) return false;
    const chans: any[] = await chList.json();
    let matched: string | null = null;
    for (const ch of chans) {
      const v = await fetch(`${ctx.handoffAriBase}/ari/channels/${ch.id}/variable?variable=LUNARA_UUID`, { headers: { Authorization: ctx.handoffAriAuth } });
      if (!v.ok) continue;
      const jv = await v.json();
      if (String(jv?.value || "") === callUuid) { matched = ch.id; break; }
    }
    if (!matched) { log("[handoff] channel not found for uuid", callUuid); return false; }
    const r = await fetch(`${ctx.handoffAriBase}/ari/channels/${matched}/variable?variable=LUNARA_HANDOFF_TARGET&value=${encodeURIComponent(target)}`, { method: "POST", headers: { Authorization: ctx.handoffAriAuth } });
    log("[handoff] set var status=", r.status, "target=", target);
    return r.ok;
  } catch (e) { log("[handoff] ari error", e); return false; }
}

// ------------------------- Gemini summary -------------------------
async function generateSummary(callSid: string, transcript: { role: string; text: string }[]) {
  if (transcript.length < 2) return;
  const dialog = transcript.map((m) => `${m.role === "agent" || m.role === "model" ? "Agent" : "User"}: ${m.text}`).join("\n").slice(0, 8000);
  const sys = `You are a call analyst. Reply in the SAME language as the dialog below. Output: 1) what the call was about (1-2 sentences), 2) key facts (bullets), 3) caller intent, 4) next steps. No filler.`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: dialog }] }] }),
    });
    if (!r.ok) return;
    const j = await r.json();
    const summary = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("").trim();
    const usage = j.usageMetadata || {};
    if (summary) {
      await sb("PATCH", `calls?twilio_call_sid=eq.${callSid}`, {
        summary,
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0,
      });
    }
  } catch (e) { log("summary", e); }
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
      await sb("PATCH", `calls?twilio_call_sid=eq.${callUuid}`, {
        transcript: transcript.slice(-500),
        status: "in_progress",
        source: "ai",
      });
    } catch (e) { log("persist", e); }
  };

  const setupHandlers = (h: GeminiHandle) => {
    h.onReady(() => {
      geminiReady = true;
      if (!greetingSent && ctx) {
        greetingSent = true;
        // Приветствие как в Twilio-мосте: client_content turn.
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
      if (name === "log_objection") result = await logObjection(ctx, callUuid, args);
      else if (name === "get_local_system_data") result = await callCrm1(ctx, args);
      else if (name === "create_emergency_ticket") result = await callCrm2(ctx, args, callUuid);
      else {
        const tool = ctx.tools.find((t) => t.name === name);
        result = tool ? await executeWebhookTool(tool, args) : { error: `unknown tool ${name}` };
      }
      h.send(buildToolResponse(id, name, result));
    });
    h.onClose((code, reason) => {
      geminiReady = false;
      log("gemini closed", code, reason);
      // Reconnect на 1011/1008 с моделью-fallback.
      if ((code === 1011 || code === 1008) && ctx) {
        const candidates = getModelCandidates(ctx.model);
        if (modelIdx < candidates.length - 1) modelIdx += 1;
        // greetingSent остаётся true — не приветствуем повторно.
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
      await sb("PATCH", `calls?twilio_call_sid=eq.${callUuid}`, { status, ended_at: new Date().toISOString() }).catch(() => {});
      if (transcript.length) void generateSummary(callUuid, transcript);
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
          const call = await sb("GET", `calls?twilio_call_sid=eq.${callUuid}&select=agent_id`).catch(() => []);
          const agentId = call?.[0]?.agent_id;
          if (!agentId) { log("no agent"); await cleanup("failed"); return; }
          ctx = await loadContext(agentId);
          if (!ctx) { log("ctx load failed"); await cleanup("failed"); return; }
          await sb("PATCH", `calls?twilio_call_sid=eq.${callUuid}`, { status: "in_progress", started_at: new Date().toISOString() });
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
            const ok = await ariSetHandoff(ctx, callUuid);
            if (ok) {
              await sb("PATCH", `calls?twilio_call_sid=eq.${callUuid}`, {
                handoff_at: new Date().toISOString(),
                handoff_to: ctx.handoffNumbers[0] || null,
                status: "handoff",
              }).catch(() => {});
            }
            // TERM frame — AudioSocket() возвращается в диалплан, диалплан делает Dial().
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
console.log(`[asterisk-bridge] AudioSocket listening on :${PORT}`);
for await (const conn of listener) {
  handleConn(conn).catch((e) => console.error("handleConn crash", e));
}

// keep exported symbol so unused imports don't lint-fail on some models
export const _OBJECTION_LABELS = OBJECTION_CATEGORY_LABELS;
