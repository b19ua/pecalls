// pg_cron hourly: snapshot per-owner ticket SLA metrics for trend charts.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sla-snapshot")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const bucket = new Date(Date.UTC(
          now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0,
        ));
        const since = new Date(bucket.getTime() - 60 * 60_000).toISOString();
        const until = bucket.toISOString();

        const { data: rows } = await supabaseAdmin
          .from("tickets")
          .select("owner_id, status, latency_ms")
          .gte("created_at", since)
          .lt("created_at", until)
          .limit(20000);

        const byOwner = new Map<string, Array<{ status: string; latency_ms: number | null }>>();
        for (const r of rows ?? []) {
          const list = byOwner.get(r.owner_id) ?? [];
          list.push({ status: r.status as string, latency_ms: r.latency_ms as number | null });
          byOwner.set(r.owner_id, list);
        }

        const { data: healths } = await supabaseAdmin
          .from("crm_health")
          .select("owner_id, breaker_open_until")
          .eq("crm_id", "crm2");
        const openMap = new Map<string, boolean>();
        for (const h of healths ?? []) {
          const until = (h as unknown as { breaker_open_until: string | null }).breaker_open_until;
          openMap.set(h.owner_id, !!until && new Date(until).getTime() > Date.now());
        }

        const snapshots: Array<Record<string, unknown>> = [];
        for (const [owner_id, arr] of byOwner.entries()) {
          const total = arr.length;
          const by = (s: string) => arr.filter((r) => r.status === s).length;
          const success = by("success");
          const failed = by("failed");
          const escalated = by("escalated");
          const pending = by("pending");
          const latencies = arr.map((r) => r.latency_ms ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
          const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : null;
          snapshots.push({
            owner_id,
            bucket_hour: bucket.toISOString(),
            total, success, failed, escalated, pending,
            p95_latency_ms: p95,
            success_rate: total ? Math.round((success / total) * 10000) / 100 : 0,
            breaker_open: openMap.get(owner_id) ?? false,
          });
        }

        if (snapshots.length) {
          await supabaseAdmin
            .from("ticket_sla_snapshots" as never)
            .upsert(snapshots as never, { onConflict: "owner_id,bucket_hour" });
        }

        return Response.json({ bucket: bucket.toISOString(), owners: snapshots.length });
      },
    },
  },
});
