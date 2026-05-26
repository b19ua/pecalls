export const AVAILABLE_LIVE_AUDIO_MODELS = [
  "models/gemini-2.5-flash-native-audio-latest",
  "models/gemini-2.5-flash-native-audio-preview-09-2025",
];

const MODEL_ALIASES: Record<string, string> = {
  "gemini-3.1-flash-live-preview": "models/gemini-2.5-flash-native-audio-latest",
  "models/gemini-3.1-flash-live-preview": "models/gemini-2.5-flash-native-audio-latest",
};

const LANGUAGE_NAMES: Record<string, string> = {
  ru: "русском",
  ro: "румынском",
  en: "английском",
  uk: "украинском",
};

const LANGUAGE_HINTS: Array<{
  language: string;
  scripts: RegExp[];
  strong: RegExp[];
  weak: RegExp[];
}> = [
  {
    language: "ru-RU",
    scripts: [/[А-Яа-яЁё]/],
    strong: [/\bздравствуйте\b/i, /\bпожалуйста\b/i, /\bэлектрич/i, /\bсвет\w*\b/i, /\bпомогите\b/i],
    weak: [/\bчто\b/i, /\bкак\b/i, /\bменя\b/i, /\bнет\b/i, /\bсейчас\b/i],
  },
  {
    language: "uk-UA",
    scripts: [/[іїєґІЇЄҐ]/, /[А-Яа-я]/],
    strong: [/\bбудь ласка\b/i, /\bдоброго\b/i, /\bдопоможіть\b/i, /\bелектр\w*\b/i, /\bсвітл\w*\b/i],
    weak: [/\bце\b/i, /\bякий\b/i, /\bнема\b/i, /\bмені\b/i, /\bщо\b/i],
  },
  {
    language: "ro-RO",
    scripts: [/[A-Za-zĂÂÎȘŞȚŢăâîșşțţ]/],
    strong: [/\bbună\b/i, /\bsalut\b/i, /\bcurent\b/i, /\bfără\b/i, /\benergie\b/i, /\bplată\b/i],
    weak: [/\bce\b/i, /\beste\b/i, /\bam\b/i, /\bvă\b/i, /\bcum\b/i],
  },
  {
    language: "en-US",
    scripts: [/[A-Za-z]/],
    strong: [/\bhello\b/i, /\bhi\b/i, /\bpower\b/i, /\bbill\b/i, /\bpayment\b/i, /\bplease\b/i],
    weak: [/\bwhat\b/i, /\bhow\b/i, /\bhelp\b/i, /\bneed\b/i, /\bmy\b/i],
  },
];

export function normalizeModelName(model?: string | null): string | null {
  if (!model) return null;
  const trimmed = model.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`;
  return MODEL_ALIASES[trimmed] || MODEL_ALIASES[normalized] || normalized;
}

export function getModelCandidates(preferred?: string | null): string[] {
  const list = [normalizeModelName(preferred), ...AVAILABLE_LIVE_AUDIO_MODELS].filter(Boolean) as string[];
  return [...new Set(list)];
}

export function getLanguageName(language: string): string {
  const short = (language || "ru-RU").split("-")[0];
  return LANGUAGE_NAMES[short] || language;
}

export function buildLanguageDirective(language: string, greeting: string): string {
  const lang = language || "ru-RU";
  const langName = getLanguageName(lang);
  return [
    "ПРАВИЛА ЯЗЫКА И ПОВЕДЕНИЯ (ОБЯЗАТЕЛЬНЫ И ИМЕЮТ ВЫСШИЙ ПРИОРИТЕТ):",
    `1. Начни разговор ОДИН РАЗ точным приветствием без изменений и без перевода на ${langName} языке (${lang}): \"${greeting}\".`,
    `2. Пока язык пользователя не распознан уверенно, продолжай на ${langName} языке (${lang}).`,
    "3. Как только язык пользователя распознан уверенно, отвечай только на этом языке, пока пользователь сам явно не переключится.",
    "4. На шум, отдельные слова, смешанную транскрипцию или сомнительные фрагменты не переключай язык самовольно.",
    "5. Никогда не повторяй стартовое приветствие после любого шума, паузы или ответа пользователя.",
    "6. Если речь непонятна, коротко попроси повторить на текущем языке диалога.",
    "7. Следуй системному промпту и знаниям компании. Не выдумывай факты и не уходи от роли ассистента.",
    "8. Реплики короткие и естественные для телефона: максимум 1-2 коротких предложения.",
  ].join("\n");
}

export function sanitizeSystemPrompt(prompt: string): string {
  return (prompt || "")
    .replace(/if unsure, default to romanian\/russian as per local context\.?/gi, "")
    .replace(/if unsure, default to romanian or russian\.?/gi, "")
    .replace(/если не уверены?,? .*румын.*русск.*\.?/gi, "")
    .replace(/respond in the language used by the customer.*$/gim, "")
    .trim();
}

export function buildKnowledgePreamble(knowledgeContext: string): string {
  if (!knowledgeContext.trim()) return "";
  return [
    "ПРОВЕРЕННЫЕ ЗНАНИЯ КОМПАНИИ (используй как внутренний контекст, не зачитывай дословно):",
    knowledgeContext.trim(),
  ].join("\n");
}

export function detectPreferredLanguage(
  text: string,
  fallbackLanguage = "ru-RU",
): { language: string; confidence: number } {
  const sample = (text || "").trim();
  if (!sample) return { language: fallbackLanguage, confidence: 0 };

  const letters = sample.match(/[\p{L}]/gu) ?? [];
  if (letters.length < 4) return { language: fallbackLanguage, confidence: 0 };

  let best = { language: fallbackLanguage, score: 0 };
  for (const hint of LANGUAGE_HINTS) {
    let score = 0;
    if (hint.scripts.some((pattern) => pattern.test(sample))) score += 1;
    score += hint.strong.reduce((sum, pattern) => sum + (pattern.test(sample) ? 2 : 0), 0);
    score += hint.weak.reduce((sum, pattern) => sum + (pattern.test(sample) ? 1 : 0), 0);
    if (score > best.score) best = { language: hint.language, score };
  }

  if (best.score <= 1) return { language: fallbackLanguage, confidence: 0.2 };
  const confidence = Math.min(1, 0.35 + best.score * 0.14);
  return { language: best.language, confidence };
}