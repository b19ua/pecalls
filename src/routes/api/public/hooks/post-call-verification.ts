// pg_cron-invoked endpoint: audits recently ended calls to detect mismatches
// between the transcript (customer clearly asked to open an emergency ticket)
// and whether a ticket row was actually created in the last 30 minutes.
// Flags mismatches to public.error_logs so supervisors can follow up.
import { createFileRoute } from "@tanstack/react-router";

const TICKET_INTENT = /(заявк|аварий|отключ|нет света|отключили свет|без электрич|no light|outage|no power)/i;

export const Route = createFileRoute("/api/public/hooks/post-call-verification")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data: calls } = await supabaseAdmin
          .from("calls")
          .select("id, owner_id, ended_at, transcript, external_call_ref, from_number")
          .not("ended_at", "is", null)
          .gte("ended_at", since)
          .limit(200);

        const flagged: Array<{ call_id: string; owner_id: string; reason: string }> = [];
        for (const c of calls ?? []) {
          const transcript = Array.isArray(c.transcript) ? c.transcript : [];
          const text = transcript
            .map((m: { text?: string; role?: string }) => (m && typeof m.text === "string" ? m.text : ""))
            .join(" ");
          if (!TICKET_INTENT.test(text)) continue;

          const { count } = await supabaseAdmin
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", c.owner_id)
            .in("status", ["success", "pending", "failed"])
            .or(`call_id.eq.${c.id},call_sid.eq.${c.external_call_ref ?? ""}`);
          if ((count ?? 0) > 0) continue;

          // Skip if we've already logged this call.
          const { count: already } = await supabaseAdmin
            .from("error_logs")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", c.owner_id)
            .eq("context", `post_call_verification:${c.id}` as never);
          if ((already ?? 0) > 0) continue;

          await supabaseAdmin.from("error_logs").insert({
            owner_id: c.owner_id,
            level: "warn",
            source: "post_call_verification",
            context: `post_call_verification:${c.id}`,
            message: "Клиент упомянул аварию/заявку, но тикет не создан",
            payload: { call_id: c.id, from_number: c.from_number, transcript_excerpt: text.slice(0, 500) } as never,
          } as never);
          flagged.push({ call_id: c.id, owner_id: c.owner_id, reason: "intent_without_ticket" });
        }
        return Response.json({ scanned: calls?.length ?? 0, flagged: flagged.length, results: flagged });
      },
    },
  },
});
