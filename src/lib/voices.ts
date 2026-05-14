// Gemini Live API native audio voices (gemini-2.5-flash-preview-native-audio-dialog)
// Each voice can be previewed via Google's TTS sample endpoint.
export type GeminiVoice = {
  id: string;
  name: string;
  description: string;
  gender: "neutral" | "female" | "male";
};

export const GEMINI_VOICES: GeminiVoice[] = [
  { id: "Puck",    name: "Puck",    description: "Энергичный, дружелюбный", gender: "neutral" },
  { id: "Charon",  name: "Charon",  description: "Глубокий, авторитетный", gender: "male" },
  { id: "Kore",    name: "Kore",    description: "Тёплый, доверительный", gender: "female" },
  { id: "Fenrir",  name: "Fenrir",  description: "Сильный, уверенный", gender: "male" },
  { id: "Aoede",   name: "Aoede",   description: "Мелодичный, спокойный", gender: "female" },
  { id: "Leda",    name: "Leda",    description: "Молодой, ясный", gender: "female" },
  { id: "Orus",    name: "Orus",    description: "Профессиональный, нейтральный", gender: "male" },
  { id: "Zephyr",  name: "Zephyr",  description: "Лёгкий, воздушный", gender: "neutral" },
];

export const LANGUAGES = [
  { code: "ru-RU", label: "Русский" },
  { code: "ro-RO", label: "Română" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "uk-UA", label: "Українська" },
];
