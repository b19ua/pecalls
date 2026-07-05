// pg_cron-invoked endpoint: pings each configured crm2_url every 5 minutes.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/crm-healthcheck")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfgs } = await supabaseAdmin
          .from("data_residency_configs")
          .select("owner_id, crm2_url, crm2_enabled")
          .eq("crm2_enabled", true);
        const results: Array<{ owner_id: string; ok: boolean; ms: number }> = [];
        for (const cfg of cfgs ?? []) {
          if (!cfg.crm2_url) continue;
          const t0 = Date.now();
          const ctl = new AbortController();
          const tid = setTimeout(() => ctl.abort(), 4000);
          let ok = false; let err: string | null = null;
          try {
            // HEAD may not be supported; try a minimal OPTIONS-style POST with empty body against the URL.
            const r = await fetch(cfg.crm2_url, { method: "OPTIONS", signal: ctl.signal });
            ok = r.status < 500;
          } catch (e) { err = e instanceof Error ? e.message : String(e); }
          clearTimeout(tid);
          const ms = Date.now() - t0;
          await supabaseAdmin.from("crm_health").upsert({
            owner_id: cfg.owner_id, crm_id: "crm2",
            last_check_at: new Date().toISOString(),
            is_up: ok, last_check_latency_ms: ms,
            last_error: err,
            updated_at: new Date().toISOString(),
          }, { onConflict: "owner_id,crm_id" });
          results.push({ owner_id: cfg.owner_id, ok, ms });
        }
        return Response.json({ checked: results.length, results });
      },
    },
  },
});
