// Общее ядро Gemini Live для всех мостов Lunara (Twilio, Asterisk, Copilot).
// Возвращает готовый setup-payload с проверенной Lunara-конфигурацией:
//   response_modalities: AUDIO
//   snake_case (как принимает Gemini Live)
//   VAD: HIGH start / LOW end (не режем клиента, ловим перебивы)
//   input+output audio transcription
//   optional function tools
//
// НЕ содержит Deno/Node-специфики — импортируется и из edge-функций, и из
// asterisk-bridge (Docker/Deno), и из локальных unit-тестов.

export type ToolDeclaration = {
  name: string;
  description?: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export type GeminiSetupInput = {
  model: string;               // "models/gemini-3.1-flash-live-preview"
  voice: string;               // "Aoede" | "Puck" | ...
  temperature?: number | null; // default 0.6
  systemText: string;          // полностью собранный system_instruction
  tools?: ToolDeclaration[];
  // VAD overrides — обычно оставляем defaults
  vad?: {
    startSensitivity?: "START_SENSITIVITY_HIGH" | "START_SENSITIVITY_LOW";
    endSensitivity?: "END_SENSITIVITY_HIGH" | "END_SENSITIVITY_LOW";
    prefixPaddingMs?: number;
    silenceDurationMs?: number;
  };
};

export function buildGeminiSetupPayload(input: GeminiSetupInput): Record<string, unknown> {
  const t = Number.isFinite(input.temperature ?? NaN) ? Number(input.temperature) : 0.6;
  const tools = input.tools && input.tools.length
    ? [{ function_declarations: input.tools }]
    : undefined;
  const vad = input.vad ?? {};
  return {
    setup: {
      model: input.model,
      generation_config: {
        response_modalities: ["AUDIO"],
        temperature: t,
        max_output_tokens: 2048,
        candidate_count: 1,
        speech_config: {
          voice_config: { prebuilt_voice_config: { voice_name: input.voice || "Aoede" } },
        },
      },
      system_instruction: { parts: [{ text: input.systemText }] },
      input_audio_transcription: {},
      output_audio_transcription: {},
      realtime_input_config: {
        automatic_activity_detection: {
          disabled: false,
          start_of_speech_sensitivity: vad.startSensitivity ?? "START_SENSITIVITY_HIGH",
          end_of_speech_sensitivity: vad.endSensitivity ?? "END_SENSITIVITY_LOW",
          prefix_padding_ms: vad.prefixPaddingMs ?? 300,
          silence_duration_ms: vad.silenceDurationMs ?? 800,
        },
        activity_handling: "NO_INTERRUPTION",
      },
      ...(tools ? { tools } : {}),
    },
  };
}

// Триггер приветствия — единый формат client_content turn для всех мостов.
export function buildGreetingTurn(greeting: string): Record<string, unknown> {
  return {
    client_content: {
      turns: [{
        role: "user",
        parts: [{ text: `Greet the caller now. Say: "${String(greeting).slice(0, 200)}"` }],
      }],
      turn_complete: true,
    },
  };
}

// Ответ на функциональный вызов Gemini — единый формат.
export function buildToolResponse(id: string, name: string, result: unknown): Record<string, unknown> {
  return {
    tool_response: {
      function_responses: [{ id, name, response: { result } }],
    },
  };
}

// Отправка пользовательского аудио (PCM16 mono 16kHz base64).
export function buildRealtimeAudio(base64Pcm16k: string): Record<string, unknown> {
  return {
    realtime_input: {
      media_chunks: [{ mime_type: "audio/pcm;rate=16000", data: base64Pcm16k }],
    },
  };
}
