import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validates an incoming Twilio webhook request signature.
 * Twilio computes: HMAC-SHA1(authToken, fullUrl + sortedFormParams).
 * If TWILIO_AUTH_TOKEN env is missing, validation is skipped (returns true)
 * to avoid breaking dev/preview, but a warning is logged.
 */
export async function verifyTwilioRequest(request: Request, form: FormData): Promise<boolean> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    console.warn("[twilio] TWILIO_AUTH_TOKEN not set — signature validation skipped");
    return true;
  }
  const sig = request.headers.get("x-twilio-signature");
  if (!sig) return false;

  // Reconstruct the full URL Twilio used to sign. Honour x-forwarded-* if present.
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const u = new URL(request.url);
  const fullUrl = `${proto}://${host}${u.pathname}${u.search}`;

  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const k of sortedKeys) data += k + params[k];

  const expected = createHmac("sha1", token).update(data).digest("base64");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
