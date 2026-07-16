// Gemini Live audio model config.
// Primary model matches the proven Lunara/AI Employee Hub setup that switches
// languages naturally and follows the prompt reliably.
export const AVAILABLE_LIVE_AUDIO_MODELS = [
  "models/gemini-3.1-flash-live-preview",
  "models/gemini-2.5-flash-native-audio-latest",
  "models/gemini-2.5-flash-native-audio-preview-09-2025",
];

const LANGUAGE_NAMES: Record<string, string> = {
  ru: "русском",
  ro: "румынском",
  en: "английском",
  uk: "украинском",
};

export function normalizeModelName(model?: string | null): string | null {
  if (!model) return null;
  const trimmed = model.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`;
}

export function getModelCandidates(preferred?: string | null): string[] {
  const list = [normalizeModelName(preferred), ...AVAILABLE_LIVE_AUDIO_MODELS].filter(Boolean) as string[];
  return [...new Set(list)];
}

export function getLanguageName(language: string): string {
  const short = (language || "ru-RU").split("-")[0];
  return LANGUAGE_NAMES[short] || language;
}

// Lunara-style phone-call instructions: short, conversational, mirror the
// caller's language. NO hard language lock — that's what breaks language switching.
export function buildPhoneInstructions(language: string, greeting: string): string {
  const langName = getLanguageName(language || "ru-RU");
  return [
    "You are speaking on a phone call. Keep replies short, conversational, and natural — 1–2 sentences max.",
    "Do not read URLs or long lists out loud.",
    `Start the conversation by greeting the caller exactly with: "${greeting}" (in ${langName}).`,
    "After the greeting, ALWAYS reply in the same language the caller uses. If the caller switches language, switch with them immediately on the next turn.",
    "Never repeat the opening greeting after the first turn.",
  ].join("\n");
}

export function sanitizeSystemPrompt(prompt: string): string {
  return (prompt || "")
    .replace(/if unsure, default to romanian\/russian as per local context\.?/gi, "")
    .replace(/if unsure, default to romanian or russian\.?/gi, "")
    .replace(/если не уверены?,? .*румын.*русск.*\.?/gi, "")
    .trim();
}

export function buildKnowledgePreamble(knowledgeContext: string): string {
  if (!knowledgeContext.trim()) return "";
  return [
    "COMPANY KNOWLEDGE (use as internal context, do not read verbatim):",
    knowledgeContext.trim(),
  ].join("\n");
}

// Kept for backwards compat with agent-test-bridge — now a no-op style stub.
export function buildLanguageDirective(language: string, greeting: string): string {
  return buildPhoneInstructions(language, greeting);
}

export function detectPreferredLanguage(
  _text: string,
  fallbackLanguage = "ru-RU",
): { language: string; confidence: number } {
  // Detection removed — Gemini Live native-audio handles language mirroring itself.
  return { language: fallbackLanguage, confidence: 0 };
}
