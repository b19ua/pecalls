// Shared AI-core for Lunara voice bridges (Twilio edge + Asterisk Docker).
// PURE TypeScript — no Deno/Node runtime globals — so this file is copied
// verbatim to asterisk-bridge/shared/ai-core.ts and imported by both.
//
// Owns behavior that MUST stay identical across mostов:
//   - objection categories + instructions
//   - phone/handoff/crm2 system_instruction assembly
//   - tool declarations (webhook tools + log_objection + get_local_system_data
//     + create_emergency_ticket)
//   - system-text assembly (sanitize + knowledge + phone + handoff + objection + crm2)
//
// Runtime-specific helpers (fetch-to-supabase, Gemini WS lifecycle, media codecs,
// reportError) live in each bridge.

export type ToolParam = { name: string; type: "string" | "number" | "boolean"; description?: string; required?: boolean; query_key?: string };
export type ToolRow = {
  id: string;
  type: "webhook" | "crm_lookup" | "crm_write";
  name: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown> & {
    url?: string; base_url?: string; path?: string; method?: string;
    auth_header_name?: string; auth_header_value?: string;
    parameters?: ToolParam[]; body_template?: string; timeout_ms?: number;
    response_hint?: string;
  };
};

export type AiCoreCtx = {
  agentId: string;
  ownerId: string;
  systemPrompt: string;
  knowledgeContext: string;
  language: string;
  greeting: string;
  handoffEnabled: boolean;
  handoffDigit: string;
  handoffNumbers: string[];
  tools: ToolRow[];
  objectionEnabled: boolean;
  objectionAaaEnabled: boolean;
  objectionCategories: string[];
  objectionCustomResponses: Record<string, string>;
  emotionTrackingEnabled: boolean;
  crm: { enabled: boolean; description: string; object1: string; object2: string; object3: string } | null;
  crm2: { enabled: boolean; systemPromptTemplate: string } | null;
  toolsConfig: Record<string, boolean>;
  // Phone number of the remote party (customer) for THIS call.
  // Inbound: caller's CLI; Outbound: number we dialed. When present, buildSystemText
  // injects a CALLER CONTEXT block so the agent can call get_local_system_data
  // without asking the caller to say the number.
  callerPhone?: string | null;
};

export function buildCallerContextBlock(phone?: string | null): string {
  const p = String(phone ?? "").trim();
  if (!p) return "";
  return `=== CALLER CONTEXT ===\nThe caller's phone number for this call is already known: ${p}.\nIf you need CRM/customer data, IMMEDIATELY call \`get_local_system_data\` with phone_number="${p}" at the start of the conversation — do NOT ask the caller to say their phone number unless this lookup fails or returns no result.\n=== END CALLER CONTEXT ===`;
}

export const OBJECTION_CATEGORY_LABELS: Record<string, string> = {
  price: "💰 Price / Budget — клиент говорит «дорого», «нет бюджета», «дешевле есть»",
  timing: "⏰ Timing — «не сейчас», «позже», «занят», «перезвоните через месяц»",
  trust: "🤝 Trust / Authority — «кто вы такие», «не слышал о вас», «боюсь обмана»",
  competitor: "🔄 Competitor — «уже работаем с X», «у нас есть решение»",
  stall: "🤔 Stall — «я подумаю», «надо посоветоваться», «пришлите на почту»",
  emotional: "😤 Emotional — раздражение, гнев, разочарование, агрессия",
  clarification: "❓ Clarification — непонимание, нужны уточнения, путаница",
};

export function toolAllowed(cfg: Record<string, boolean> | undefined, name: string): boolean {
  if (!cfg || typeof cfg !== "object") return true;
  if (!(name in cfg)) return true;
  return cfg[name] !== false;
}

export function buildObjectionInstructions(c: Pick<AiCoreCtx, "objectionEnabled" | "objectionAaaEnabled" | "objectionCategories" | "objectionCustomResponses" | "emotionTrackingEnabled">): string {
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

export type ToolDecl = { name: string; description: string; parameters: { type: "object"; properties: Record<string, { type: string; description?: string }>; required: string[] } };

export type CrmFact = {
  path: string;
  key: string;
  label: string;
  value: string | number | boolean;
};

const CRM_FACT_LIMIT = 60;
const CRM_VALUE_LIMIT = 500;

export const CRM_TOOL_RESPONSE_INSTRUCTIONS =
  "When a CRM/tool response contains `crm_answer_context`, `crm_semantic`, or `crm_facts`, use those normalized facts first. If the caller asks for debt, balance, payment amount, address, ticket status, or another customer field, answer from those exact values; do not say that the data is unavailable while the value is present in the tool response.";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function scalarValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s.slice(0, CRM_VALUE_LIMIT) : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  return null;
}

function lastKey(path: string): string {
  const parts = path.replace(/\[\d+\]/g, "").split(".").filter(Boolean);
  return parts[parts.length - 1] || path;
}

function humanizeKey(key: string): string {
  const known: Record<string, string> = {
    NAME: "Имя клиента",
    LAST_NAME: "Фамилия клиента",
    SECOND_NAME: "Отчество клиента",
    FULL_NAME: "ФИО клиента",
    PHONE: "Телефон клиента",
    ADDRESS: "Адрес клиента",
    ADDRESS_CITY: "Город",
    ADDRESS_STREET: "Улица",
    ADDRESS_1: "Адрес клиента",
    EMAIL: "Email клиента",
    UF_CRM_1784721692802: "Задолженность по оплате",
  };
  if (known[key]) return known[key];
  return key
    .replace(/^UF_CRM_/i, "CRM поле ")
    .replace(/_/g, " ")
    .trim();
}

function labelFromHint(key: string, responseHint: string): string | null {
  if (!responseHint || !key) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parenthetical = responseHint.match(new RegExp(`${escaped}\\s*\\(([^)]+)\\)`, "i"));
  if (parenthetical?.[1]) return parenthetical[1].trim();
  const lower = responseHint.toLowerCase();
  if (lower.includes(key.toLowerCase())) {
    if (/(задолж|долг|debt|balance|оплат|payment|amount|сумм)/i.test(responseHint)) return "Задолженность по оплате";
    if (/(имя|name|клиент|customer)/i.test(responseHint)) return "Имя клиента";
  }
  return null;
}

function labelForFact(path: string, responseHint: string): string {
  const key = lastKey(path);
  return labelFromHint(key, responseHint) || humanizeKey(key);
}

function collectFacts(value: unknown, path: string, responseHint: string, out: CrmFact[], depth = 0): void {
  if (out.length >= CRM_FACT_LIMIT || depth > 6) return;
  const scalar = scalarValue(value);
  if (scalar !== null) {
    const key = lastKey(path);
    out.push({ path, key, label: labelForFact(path, responseHint), value: scalar });
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, 3); i += 1) {
      collectFacts(value[i], `${path}[${i}]`, responseHint, out, depth + 1);
      if (out.length >= CRM_FACT_LIMIT) return;
    }
    return;
  }
  if (!isRecord(value)) return;
  for (const [k, v] of Object.entries(value)) {
    if (k === "raw" || k === "data") continue;
    collectFacts(v, path ? `${path}.${k}` : k, responseHint, out, depth + 1);
    if (out.length >= CRM_FACT_LIMIT) return;
  }
}

function pickPrimaryRecord(data: unknown): { node: unknown; path: string } {
  if (Array.isArray(data)) return { node: data[0] ?? data, path: Array.isArray(data) && data.length ? "[0]" : "" };
  if (!isRecord(data)) return { node: data, path: "" };
  const candidateKeys = ["result", "items", "data", "records", "contacts", "companies", "leads", "deals"];
  for (const key of candidateKeys) {
    const v = data[key];
    if (Array.isArray(v) && v.length) return { node: v[0], path: `${key}[0]` };
    if (isRecord(v)) return { node: v, path: key };
  }
  return { node: data, path: "" };
}

function factMatches(f: CrmFact, re: RegExp): boolean {
  return re.test(`${f.key} ${f.label} ${f.path}`);
}

export function normalizeCrmToolResult(data: unknown, responseHint = "") {
  const primary = pickPrimaryRecord(data);
  const facts: CrmFact[] = [];
  collectFacts(primary.node, primary.path, responseHint, facts);
  if (!facts.length) collectFacts(data, "", responseHint, facts);

  const nameFact = facts.find((f) => /^(NAME|FULL_NAME)$/i.test(f.key))
    || facts.find((f) => factMatches(f, /(имя клиента|customer name|client name)/i));
  const lastNameFact = facts.find((f) => /^LAST_NAME$/i.test(f.key));
  const debtFact = facts.find((f) => /^UF_CRM_1784721692802$/i.test(f.key))
    || facts.find((f) => factMatches(f, /(задолж|долг|debt|balance|остаток|оплат|payment due|amount due|сумм)/i));
  const phoneFact = facts.find((f) => factMatches(f, /(^|\b)(PHONE|телефон|phone)(\b|$)/i));
  const addressFact = facts.find((f) => factMatches(f, /(адрес|address|street|улица|дом)/i));

  const semantic: Record<string, string | number | boolean> = {};
  if (nameFact) semantic.customer_name = lastNameFact && lastNameFact.value !== nameFact.value
    ? `${String(nameFact.value)} ${String(lastNameFact.value)}`.trim()
    : nameFact.value;
  if (debtFact) semantic.payment_debt = debtFact.value;
  if (phoneFact) semantic.phone_number = phoneFact.value;
  if (addressFact) semantic.address = addressFact.value;

  const lines = [
    "CRM FACTS — use these exact values when answering the caller:",
    ...Object.entries(semantic).map(([k, v]) => `- ${k}: ${String(v)}`),
    ...facts.slice(0, 25).map((f) => `- ${f.label} (${f.path}): ${String(f.value)}`),
  ];

  return {
    crm_primary_record_path: primary.path || "root",
    crm_semantic: semantic,
    crm_facts: facts,
    crm_answer_context: lines.join("\n"),
    crm_instructions: CRM_TOOL_RESPONSE_INSTRUCTIONS,
  };
}

export function buildToolDeclarations(tools: ToolRow[], ctx: AiCoreCtx): ToolDecl[] {
  const cfg = ctx.toolsConfig;
  const decls: ToolDecl[] = tools
    .filter((t) => toolAllowed(cfg, t.name))
    .map((t) => {
      const params = t.config.parameters ?? [];
      const properties: Record<string, { type: string; description?: string }> = {};
      const required: string[] = [];
      for (const p of params) {
        if (!p.name) continue;
        properties[p.name] = { type: p.type || "string", description: p.description || undefined };
        if (p.required) required.push(p.name);
      }
      const crmResponseHint = t.type === "crm_lookup" || t.type === "crm_write"
        ? CRM_TOOL_RESPONSE_INSTRUCTIONS
        : "";
      return {
        name: t.name,
        description: [t.description, t.config.response_hint, crmResponseHint].filter(Boolean).join("\n"),
        parameters: { type: "object", properties, required },
      };
    });
  if (ctx.objectionEnabled && toolAllowed(cfg, "log_objection")) {
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
  if (ctx.crm?.enabled && toolAllowed(cfg, "get_local_system_data")) {
    const c = ctx.crm;
    const phoneHint = ctx.callerPhone
      ? ` The caller's phone number is ALREADY known from CALLER CONTEXT above (${ctx.callerPhone}) — call this tool immediately at the start of the conversation using that number; do NOT wait for the caller to state it.`
      : "";
    decls.push({
      name: "get_local_system_data",
      description: `${c.description}\nSILENTLY call this the moment the caller's phone number is known (or as soon as they identify themselves) to enrich the conversation with CRM data.${phoneHint} Returns fields: ${c.object1}, ${c.object2}, ${c.object3}. If the response contains crm_answer_context/crm_semantic/crm_facts, answer from those exact values. If the data is temporarily unavailable, continue the dialog naturally without mentioning the tool.`,
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Caller phone number in E.164 if known, otherwise as spoken." },
        },
        required: ["phone_number"],
      },
    });
  }
  if (ctx.crm2?.enabled && toolAllowed(cfg, "create_emergency_ticket")) {
    decls.push({
      name: "create_emergency_ticket",
      description: "Создает официальную заявку об аварии, отключении электричества или обрыве линий электропередач. Перед вызовом обязательно подтвердить у клиента адрес (или NLC) и тип проблемы устным согласием.",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Caller phone number in E.164 or as spoken." },
          nlc_number: { type: "string", description: "7-значный номер места потребления (NLC) из квитанции клиента, если известен." },
          facility_address: { type: "string", description: "Адрес аварии: город/село, улица, дом. Обязательно, если nlc_number отсутствует." },
          emergency_type: { type: "string", description: "Строго один из: no_light_individual, no_light_area, wire_down_danger, sparking_equipment." },
          caller_comment: { type: "string", description: "Краткое описание проблемы со слов клиента." },
        },
        required: ["phone_number", "emergency_type"],
      },
    });
  }
  return decls;
}

// Assembles the full system_instruction text the same way for every bridge.
// The caller supplies phone-instruction and knowledge-preamble builders (they live
// in _shared/live-config.ts on edge, mirrored inside asterisk-bridge/shared/).
export function buildSystemText(
  ctx: AiCoreCtx,
  builders: {
    sanitizeSystemPrompt: (p: string) => string;
    buildKnowledgePreamble: (k: string) => string;
    buildPhoneInstructions: (lang: string, greeting: string) => string;
  },
): string {
  const phoneInstr = builders.buildPhoneInstructions(ctx.language || "ru-RU", ctx.greeting);
  const knowledgePreamble = builders.buildKnowledgePreamble(ctx.knowledgeContext || "");
  const handoffInstr = ctx.handoffEnabled && ctx.handoffNumbers.length
    ? `Human handoff rule: if the caller asks for an operator, manager, human, specialist, or transfer, do NOT say that you are transferring immediately and NEVER speak, dictate or read any phone number out loud (the system handles dialing). Just tell the caller in one short sentence to press ${ctx.handoffDigit || "0"} on the phone keypad to connect to the operator. Do not ask extra questions, do not mention digits other than ${ctx.handoffDigit || "0"}.`
    : "";
  const objectionInstr = buildObjectionInstructions(ctx);
  const crm2Instr = ctx.crm2?.enabled && ctx.crm2.systemPromptTemplate.trim()
    ? `\n\n=== EMERGENCY TICKET CREATION (create_emergency_ticket) ===\n${ctx.crm2.systemPromptTemplate.trim()}\n=== END EMERGENCY TICKET ===`
    : "";
  const callerCtxBlock = buildCallerContextBlock(ctx.callerPhone);
  return [
    builders.sanitizeSystemPrompt(ctx.systemPrompt || ""),
    knowledgePreamble,
    phoneInstr,
    callerCtxBlock,
    handoffInstr,
    objectionInstr,
    crm2Instr,
  ].filter(Boolean).join("\n\n");
}
