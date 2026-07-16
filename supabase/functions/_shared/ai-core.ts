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
};

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
      return {
        name: t.name,
        description: [t.description, t.config.response_hint].filter(Boolean).join("\n"),
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
  return [
    builders.sanitizeSystemPrompt(ctx.systemPrompt || ""),
    knowledgePreamble,
    phoneInstr,
    handoffInstr,
    objectionInstr,
    crm2Instr,
  ].filter(Boolean).join("\n\n");
}
