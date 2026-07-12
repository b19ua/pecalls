// PII redaction helpers. Keep last 2 digits for phone/NLC so supervisors can eyeball.
export function redactPhone(v: string | null | undefined): string | null {
  if (!v) return v ?? null;
  const digits = v.replace(/\D+/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-2)}`;
}
const EMAIL_RE = /([A-Z0-9._%+-])[A-Z0-9._%+-]*(@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const PHONE_RE = /(\+?\d[\d\s\-().]{7,}\d)/g;
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
// IBAN: 2 letters + 2 digits + 11..30 alphanumerics
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

export function redactText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(EMAIL_RE, (_, a, b) => `${a}***${b}`)
    .replace(IBAN_RE, (m) => `${m.slice(0, 4)}***${m.slice(-2)}`)
    .replace(CARD_RE, "***card***")
    .replace(PHONE_RE, (m) => {
      const d = m.replace(/\D+/g, "");
      return d.length >= 4 ? `***${d.slice(-2)}` : "***";
    });
}

/** Deeply redact string leaves in an object; array & object recursion. */
export function redactPayload<T = unknown>(v: T): T {
  if (v == null) return v;
  if (typeof v === "string") return redactText(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => redactPayload(x)) as unknown as T;
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = redactPayload(val);
    }
    return out as unknown as T;
  }
  return v;
}
