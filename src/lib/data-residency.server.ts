// Server-only helpers for the Client Data Gateway integration.
// Importing this file from client-reachable code is blocked by the *.server.ts convention.
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ResidencyConfig = {
  owner_id: string;
  mode: "cloud" | "self_hosted";
  gateway_url: string | null;
  hmac_secret: string | null;
  enabled: boolean;
};

export async function getResidencyConfig(ownerId: string): Promise<ResidencyConfig | null> {
  const { data } = await supabaseAdmin
    .from("data_residency_configs")
    .select("owner_id, mode, gateway_url, hmac_secret, enabled")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return (data as ResidencyConfig | null) ?? null;
}

export function isSelfHosted(cfg: ResidencyConfig | null): cfg is ResidencyConfig & {
  gateway_url: string;
  hmac_secret: string;
} {
  return !!cfg && cfg.enabled && cfg.mode === "self_hosted" && !!cfg.gateway_url && !!cfg.hmac_secret;
}

function sign(secret: string, ts: string, method: string, path: string, body: string): string {
  return createHmac("sha256", secret).update(`${ts}\n${method}\n${path}\n${body}`).digest("hex");
}

/**
 * Call the client's gateway. The body is HMAC-signed with the per-owner shared secret.
 * Headers used by the reference gateway:
 *   x-lunara-timestamp, x-lunara-signature, x-lunara-owner
 */
export async function callGateway<T = unknown>(
  cfg: ResidencyConfig & { gateway_url: string; hmac_secret: string },
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; error: string }> {
  const url = cfg.gateway_url.replace(/\/+$/, "") + path;
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = body ? JSON.stringify(body) : "";
  const signature = sign(cfg.hmac_secret, ts, method, path, payload);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  try {
    const r = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        "x-lunara-owner": cfg.owner_id,
        "x-lunara-timestamp": ts,
        "x-lunara-signature": signature,
      },
      body: method === "GET" ? undefined : payload,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) return { ok: false, status: r.status, error: typeof data === "string" ? data : JSON.stringify(data) };
    return { ok: true, status: r.status, data: data as T };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

/** Verify a gateway -> our cloud callback signature (e.g. webhook back from gateway). */
export function verifyGatewayCallback(
  secret: string,
  headers: Headers,
  method: string,
  path: string,
  rawBody: string,
): boolean {
  const ts = headers.get("x-lunara-timestamp") ?? "";
  const sig = headers.get("x-lunara-signature") ?? "";
  if (!ts || !sig) return false;
  const drift = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(drift) || drift > 300) return false;
  const expected = sign(secret, ts, method, path, rawBody);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
