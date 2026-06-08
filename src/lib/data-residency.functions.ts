import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ConfigInput = z.object({
  mode: z.enum(["cloud", "self_hosted"]),
  gateway_url: z.string().url().max(500).nullable().optional(),
  hmac_secret: z.string().min(16).max(256).nullable().optional(),
  enabled: z.boolean(),
  purge_twilio_after_ingest: z.boolean().optional(),
  proxy_audio: z.boolean().optional(),
});

export const getResidencyConfigFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("data_residency_configs")
      .select("mode, gateway_url, hmac_secret, enabled, purge_twilio_after_ingest, proxy_audio, last_ping_at, last_ping_ok, last_ping_error")
      .eq("owner_id", userId)
      .maybeSingle();
    return data ?? {
      mode: "cloud", gateway_url: null, hmac_secret: null, enabled: false,
      purge_twilio_after_ingest: true, proxy_audio: false,
      last_ping_at: null, last_ping_ok: null, last_ping_error: null,
    };
  });

export const saveResidencyConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ConfigInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      owner_id: userId,
      mode: data.mode,
      gateway_url: data.gateway_url ?? null,
      hmac_secret: data.hmac_secret ?? null,
      enabled: data.enabled,
      ...(typeof data.purge_twilio_after_ingest === "boolean" ? { purge_twilio_after_ingest: data.purge_twilio_after_ingest } : {}),
      ...(typeof data.proxy_audio === "boolean" ? { proxy_audio: data.proxy_audio } : {}),
    };
    const { error } = await supabase
      .from("data_residency_configs")
      .upsert(row, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pingResidencyGatewayFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { getResidencyConfig, callGateway, isSelfHosted } = await import("@/lib/data-residency.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = await getResidencyConfig(userId);
    if (!isSelfHosted(cfg)) return { ok: false, error: "Gateway not configured" };
    const res = await callGateway(cfg, "GET", "/health", undefined, { timeoutMs: 8000 });
    await supabaseAdmin
      .from("data_residency_configs")
      .update({
        last_ping_at: new Date().toISOString(),
        last_ping_ok: res.ok,
        last_ping_error: res.ok ? null : res.error.slice(0, 500),
      })
      .eq("owner_id", userId);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  });

/** Returns audio URL + transcript for a single call, sourced from cloud or client gateway. */
type TranscriptItem = { role?: string; source?: string; text?: string; at?: string };
type CallContent = {
  audioUrl: string | null;
  transcript: TranscriptItem[];
  summary: string | null;
  source: "cloud" | "self_hosted" | "self_hosted_offline" | "self_hosted_error";
  error?: string;
};

export const getCallContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ callId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CallContent> => {
    const { supabase, userId } = context;
    const { data: call, error } = await supabase
      .from("calls")
      .select("id, owner_id, recording_path, recording_url, transcript, summary, data_residency, external_call_ref")
      .eq("id", data.callId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!call || call.owner_id !== userId) throw new Error("Not found");

    if (call.data_residency === "self_hosted") {
      const { getResidencyConfig, callGateway, isSelfHosted, signAudioToken } = await import("@/lib/data-residency.server");
      const cfg = await getResidencyConfig(userId);
      if (!isSelfHosted(cfg)) {
        return { audioUrl: null, transcript: [], summary: null, source: "self_hosted_offline" as const };
      }
      const ref = call.external_call_ref ?? call.id;
      const res = await callGateway<{
        audio_url: string | null;
        transcript: unknown[];
        summary: string | null;
      }>(cfg, "GET", `/calls/${encodeURIComponent(ref)}`);
      if (!res.ok) {
        return { audioUrl: null, transcript: [], summary: null, source: "self_hosted_error" as const, error: res.error };
      }
      // If proxy mode is enabled (gateway not reachable from the user's browser, e.g. VPN-only),
      // hand the browser our own proxy URL — the server streams bytes from the gateway.
      const audioUrl = cfg.proxy_audio
        ? `/api/audio/${call.id}?o=${userId}&t=${signAudioToken(call.id, userId, 3600)}`
        : res.data.audio_url;
      return {
        audioUrl,
        transcript: (Array.isArray(res.data.transcript) ? res.data.transcript : []) as TranscriptItem[],
        summary: res.data.summary ?? null,
        source: "self_hosted" as const,
      };
    }

    let audioUrl: string | null = call.recording_url ?? null;
    if (call.recording_path) {
      const { data: signed } = await supabase.storage
        .from("call-recordings")
        .createSignedUrl(call.recording_path, 60 * 60);
      audioUrl = signed?.signedUrl ?? audioUrl;
    }
    return {
      audioUrl,
      transcript: (Array.isArray(call.transcript) ? call.transcript : []) as TranscriptItem[],
      summary: call.summary,
      source: "cloud" as const,
    };
  });
