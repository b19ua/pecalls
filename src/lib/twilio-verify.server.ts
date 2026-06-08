import { createHmac, timingSafeEqual } from "crypto";

function hostVariants(request: Request) {
  const u = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || u.host;
  const proto = request.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  const publicBase = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  const variants = new Set<string>();

  variants.add(`${proto}://${host}${u.pathname}${u.search}`);
  variants.add(`${u.protocol.replace(":", "")}://${u.host}${u.pathname}${u.search}`);
  if (publicBase) variants.add(`${publicBase}${u.pathname}${u.search}`);

  return Array.from(variants);
}

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

  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);
  const sortedKeys = Object.keys(params).sort();
  try {
    const a = Buffer.from(sig);
    for (const fullUrl of hostVariants(request)) {
      let data = fullUrl;
      for (const k of sortedKeys) data += k + params[k];
      const expected = createHmac("sha1", token).update(data).digest("base64");
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
