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
  crm_enabled: z.boolean().optional(),
  crm_url: z.string().url().max(500).nullable().optional(),
  crm_auth_header: z.string().max(100).optional(),
  crm_auth_value: z.string().max(2000).optional(),
  crm_timeout_ms: z.number().int().min(500).max(10000).optional(),
  crm_tool_description: z.string().max(1000).optional(),
  crm_object1_label: z.string().max(80).optional(),
  crm_object2_label: z.string().max(80).optional(),
  crm_object3_label: z.string().max(80).optional(),
  crm2_enabled: z.boolean().optional(),
  crm2_url: z.string().url().max(500).nullable().optional(),
  crm2_timeout_ms: z.number().int().min(1000).max(10000).optional(),
  crm2_system_prompt_template: z.string().max(4000).optional(),
});

export const getResidencyConfigFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("data_residency_configs")
      .select("mode, gateway_url, hmac_secret, enabled, purge_twilio_after_ingest, proxy_audio, last_ping_at, last_ping_ok, last_ping_error, crm_enabled, crm_url, crm_auth_header, crm_auth_value, crm_timeout_ms, crm_tool_description, crm_object1_label, crm_object2_label, crm_object3_label, crm2_enabled, crm2_url, crm2_timeout_ms, crm2_system_prompt_template")
      .eq("owner_id", userId)
      .maybeSingle();
    return data ?? {
      mode: "cloud", gateway_url: null, hmac_secret: null, enabled: false,
      purge_twilio_after_ingest: true, proxy_audio: false,
      last_ping_at: null, last_ping_ok: null, last_ping_error: null,
      crm_enabled: false, crm_url: null, crm_auth_header: "", crm_auth_value: "",
      crm_timeout_ms: 2000,
      crm_tool_description: "Get caller info from local CRM by phone number. Returns three fields about the customer.",
      crm_object1_label: "object_1", crm_object2_label: "object_2", crm_object3_label: "object_3",
      crm2_enabled: false, crm2_url: "http://10.8.0.2:8000/create-ticket", crm2_timeout_ms: 3000,
      crm2_system_prompt_template: "",
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
      ...(typeof data.crm_enabled === "boolean" ? { crm_enabled: data.crm_enabled } : {}),
      ...(data.crm_url !== undefined ? { crm_url: data.crm_url ?? null } : {}),
      ...(typeof data.crm_auth_header === "string" ? { crm_auth_header: data.crm_auth_header } : {}),
      ...(typeof data.crm_auth_value === "string" ? { crm_auth_value: data.crm_auth_value } : {}),
      ...(typeof data.crm_timeout_ms === "number" ? { crm_timeout_ms: data.crm_timeout_ms } : {}),
      ...(typeof data.crm_tool_description === "string" ? { crm_tool_description: data.crm_tool_description } : {}),
      ...(typeof data.crm_object1_label === "string" ? { crm_object1_label: data.crm_object1_label } : {}),
      ...(typeof data.crm_object2_label === "string" ? { crm_object2_label: data.crm_object2_label } : {}),
      ...(typeof data.crm_object3_label === "string" ? { crm_object3_label: data.crm_object3_label } : {}),
      ...(typeof data.crm2_enabled === "boolean" ? { crm2_enabled: data.crm2_enabled } : {}),
      ...(data.crm2_url !== undefined ? { crm2_url: data.crm2_url ?? null } : {}),
      ...(typeof data.crm2_timeout_ms === "number" ? { crm2_timeout_ms: data.crm2_timeout_ms } : {}),
      ...(typeof data.crm2_system_prompt_template === "string" ? { crm2_system_prompt_template: data.crm2_system_prompt_template } : {}),
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

export const gatewayHealthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { getResidencyConfig, callGateway, isSelfHosted } = await import("@/lib/data-residency.server");
    const cfg = await getResidencyConfig(userId);
    if (!isSelfHosted(cfg)) return { ok: false as const, error: "Gateway not configured" };
    const t0 = Date.now();
    const ready = await callGateway<Record<string, unknown>>(cfg, "GET", "/ready", undefined, { timeoutMs: 8000 });
    const latencyMs = Date.now() - t0;
    if (!ready.ok) return { ok: false as const, error: ready.error, latencyMs };
    return { ok: true as const, latencyMs, info: JSON.parse(JSON.stringify(ready.data)) as Record<string, string | number | boolean | null> };
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

type TicketRow = {
  id: string; created_at: string; status: string; attempts: number; latency_ms: number | null;
  emergency_type: string | null; phone_number: string | null; nlc_number: string | null;
  facility_address: string | null; external_ticket_id: string | null; last_error: string | null;
  call_sid: string | null; call_id: string | null;
};

export const listRecentTicketsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }): Promise<{ tickets: TicketRow[] }> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("tickets" as never)
      .select("id, created_at, status, attempts, latency_ms, emergency_type, phone_number, nlc_number, facility_address, external_ticket_id, last_error, call_sid, call_id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { tickets: (rows ?? []) as unknown as TicketRow[] };
  });

type CrmHealthRow = {
  crm_id: string; consecutive_failures: number; breaker_open_until: string | null;
  last_success_at: string | null; last_failure_at: string | null; last_error: string | null;
  updated_at: string;
};

export const getCrmHealthFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: CrmHealthRow[] }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("crm_health" as never)
      .select("crm_id, consecutive_failures, breaker_open_until, last_success_at, last_failure_at, last_error, updated_at")
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as CrmHealthRow[] };
  });
