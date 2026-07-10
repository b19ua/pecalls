import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ticket = {
  id: string; created_at: string; updated_at: string;
  status: string; attempts: number; max_attempts: number | null;
  latency_ms: number | null;
  emergency_type: string | null; phone_number: string | null;
  nlc_number: string | null; facility_address: string | null;
  caller_comment: string | null;
  external_ticket_id: string | null; external_status: string | null;
  last_error: string | null; call_sid: string | null; call_id: string | null;
  next_retry_at: string | null; escalated_at: string | null;
  idempotency_key: string | null;
};

const FilterSchema = z.object({
  status: z.array(z.enum(["pending", "success", "failed", "escalated", "duplicate"])).optional(),
  q: z.string().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const listTicketsFilteredFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FilterSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ tickets: Ticket[]; supervisor: boolean }> => {
    const { supabase, userId } = context;
    const { data: isSupervisor } = await supabase.rpc("has_role", { _user_id: userId, _role: "supervisor" });
    const supervisor = !!isSupervisor;

    let q = supabase
      .from("tickets" as never)
      .select("id, created_at, updated_at, status, attempts, max_attempts, latency_ms, emergency_type, phone_number, nlc_number, facility_address, caller_comment, external_ticket_id, external_status, last_error, call_sid, call_id, next_retry_at, escalated_at, idempotency_key")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    // Owners see all their tickets; supervisors see escalated/failed across owners (RLS enforced).
    if (!supervisor) q = q.eq("owner_id", userId);
    if (data.status?.length) q = q.in("status", data.status);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "")}%`;
      q = q.or(
        `phone_number.ilike.${like},nlc_number.ilike.${like},facility_address.ilike.${like},external_ticket_id.ilike.${like},call_sid.ilike.${like}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let tickets = (rows ?? []) as unknown as Ticket[];
    if (supervisor) {
      const { redactPhone, redactText } = await import("@/lib/pii");
      tickets = tickets.map((t) => ({
        ...t,
        phone_number: redactPhone(t.phone_number),
        nlc_number: redactPhone(t.nlc_number),
        caller_comment: t.caller_comment ? redactText(t.caller_comment) : t.caller_comment,
        last_error: t.last_error ? redactText(t.last_error) : t.last_error,
      }));
    }
    return { tickets, supervisor };
  });

export const retryTicketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("tickets" as never)
      .update({
        status: "pending",
        next_retry_at: new Date().toISOString(),
        last_error: null,
        escalated_at: null,
      } as never)
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

type Stats = {
  total: number; success: number; failed: number;
  escalated: number; pending: number;
  successRate: number; p95Latency: number | null;
  breakerOpen: boolean; last24hTotal: number;
};

export const ticketsStatsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Stats> => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    const since24 = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { data: rows } = await supabase
      .from("tickets" as never)
      .select("status, latency_ms, created_at")
      .eq("owner_id", userId)
      .gte("created_at", since)
      .limit(2000);
    const arr = (rows ?? []) as unknown as Array<{ status: string; latency_ms: number | null; created_at: string }>;
    const total = arr.length;
    const by = (s: string) => arr.filter((r) => r.status === s).length;
    const success = by("success");
    const failed = by("failed");
    const escalated = by("escalated");
    const pending = by("pending");
    const latencies = arr.map((r) => r.latency_ms ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
    const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : null;
    const last24hTotal = arr.filter((r) => r.created_at >= since24).length;

    const { data: health } = await supabase
      .from("crm_health" as never)
      .select("breaker_open_until")
      .eq("owner_id", userId)
      .eq("crm_id", "crm2")
      .maybeSingle();
    const openUntil = (health as unknown as { breaker_open_until: string | null } | null)?.breaker_open_until;
    const breakerOpen = !!openUntil && new Date(openUntil).getTime() > Date.now();

    return {
      total, success, failed, escalated, pending,
      successRate: total ? Math.round((success / total) * 1000) / 10 : 0,
      p95Latency: p95, breakerOpen, last24hTotal,
    };
  });

type TrendPoint = {
  bucket_hour: string;
  total: number;
  success: number;
  failed: number;
  escalated: number;
  success_rate: number;
  p95_latency_ms: number | null;
  breaker_open: boolean;
};

export const slaTrendFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ hours: z.number().int().min(6).max(720).default(168) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ points: TrendPoint[] }> => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - data.hours * 60 * 60_000).toISOString();
    const { data: rows, error } = await supabase
      .from("ticket_sla_snapshots" as never)
      .select("bucket_hour, total, success, failed, escalated, success_rate, p95_latency_ms, breaker_open")
      .eq("owner_id", userId)
      .gte("bucket_hour", since)
      .order("bucket_hour", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    return { points: (rows ?? []) as unknown as TrendPoint[] };
  });
