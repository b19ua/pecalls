// Cheap keyword fast-path for critical risk signals.
// Runs on EVERY transcript insert, in O(text length), no LLM call.
// Bypasses the 6-second analyzer debounce — fires immediately to red.

export type FastRisk = {
  primary_signal:
    | "cancellation_risk"
    | "escalation"
    | "compliance_risk"
    | "handoff_needed"
    | "frustration";
  reason: string;
};

// Multilingual (RU + EN). Patterns are matched case-insensitive on customer text.
// Keep tight — false positives downgrade trust in the red badge.
const PATTERNS: Array<{ re: RegExp; signal: FastRisk["primary_signal"]; reason: string }> = [
  // Manager / human handoff demand
  { re: /\b(дайте|позовите|соедините|позвать|переключите)\s+(менеджера|оператора|человека|старшего|руководителя|супервайзера)\b/i,
    signal: "handoff_needed", reason: "Клиент требует менеджера" },
  { re: /\b(give me|put me through|connect me|speak to|talk to)\s+(a\s+)?(manager|supervisor|human|agent|person)\b/i,
    signal: "handoff_needed", reason: "Customer demands a manager" },
  { re: /\b(хочу|нужен|нужна)\s+(живого\s+)?(человека|оператора|менеджера)\b/i,
    signal: "handoff_needed", reason: "Клиент просит живого человека" },

  // Cancellation / refund / quit
  { re: /\b(отмен(?:ить|яю|и)|расторгнуть|отказ(?:аться|ываюсь)|верните\s+деньги|возврат\s+(денег|средств))\b/i,
    signal: "cancellation_risk", reason: "Клиент хочет отменить / вернуть деньги" },
  { re: /\b(cancel(?:ling|lation)?|refund|terminate(?:\s+contract)?|chargeback|money\s+back)\b/i,
    signal: "cancellation_risk", reason: "Customer wants to cancel / refund" },
  { re: /\b(хочу\s+отключиться|отключите\s+меня|расторгаю|больше\s+не\s+буду\s+пользоваться)\b/i,
    signal: "cancellation_risk", reason: "Клиент хочет отключиться" },

  // Complaint / legal / regulator
  { re: /\b(жалоб[ау]|пожалуюсь|роспотребнадзор|прокурор|в\s+суд|подам\s+в\s+суд|fcc|ftc|consumer\s+protection|attorney|lawyer|sue|lawsuit|complaint)\b/i,
    signal: "compliance_risk", reason: "Угроза жалобой / судом / регулятором" },
  { re: /\b(gdpr|ccpa|persondata|персональные\s+данные|обработка\s+данных|удалите\s+мои\s+данные|delete\s+my\s+data)\b/i,
    signal: "compliance_risk", reason: "Запрос по данным / GDPR" },

  // Strong frustration / escalation
  { re: /\b(сколько\s+можно|это\s+безобразие|вы\s+(меня\s+)?обманываете|надоело|невыносимо|хам(ите|ство))\b/i,
    signal: "escalation", reason: "Клиент в ярости" },
  { re: /\b(this\s+is\s+ridiculous|unacceptable|are\s+you\s+kidding|i\s+(am|'m)\s+(furious|done|fed\s+up))\b/i,
    signal: "escalation", reason: "Customer is furious" },

  // AI-stuck pattern (customer telling bot it doesn't understand)
  { re: /\b(вы\s+(меня\s+)?не\s+понимаете|это\s+(бот|робот|автоответчик)|я\s+с\s+роботом|talking\s+to\s+a\s+(bot|robot|machine)|you('re|\s+are)\s+not\s+understanding)\b/i,
    signal: "handoff_needed", reason: "Клиент жалуется на бота — нужен человек" },
];

export function scanCustomerText(text: string): FastRisk | null {
  if (!text || text.length < 3) return null;
  for (const p of PATTERNS) {
    if (p.re.test(text)) return { primary_signal: p.signal, reason: p.reason };
  }
  return null;
}

// Apply a fast red flag to the row, bypassing the analyzer debounce.
// Uses score=90, level=red. Subsequent LLM passes may refine the reason.
export async function applyFastRed(
  supa: { from: (t: string) => any },
  table: "calls" | "copilot_sessions",
  rowId: string,
  ownerId: string,
  hit: FastRisk,
  quote: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await supa.from(table).update({
      risk_level: "red",
      risk_score: 90,
      risk_reason: hit.reason,
      primary_signal: hit.primary_signal,
      suggested_action: hit.primary_signal === "handoff_needed"
        ? "Подключиться и забрать звонок"
        : hit.primary_signal === "cancellation_risk"
        ? "Удержать клиента — предложить решение немедленно"
        : "Срочно вмешаться",
      risk_updated_at: now,
      sentiment: "negative",
    }).eq("id", rowId);
    await supa.from("call_analysis_events").insert({
      owner_id: ownerId,
      call_id: rowId,
      call_kind: table === "calls" ? "call" : "copilot_session",
      risk_level: "red",
      risk_score: 90,
      risk_reason: hit.reason,
      primary_signal: hit.primary_signal,
      suggested_action: "fast-path",
      signals: { source: "keyword", quote: quote.slice(0, 200) },
    });
  } catch (e) {
    console.error("[fast-red] failed", e);
  }
}
