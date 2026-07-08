// pg_cron-invoked endpoint: retries pending/failed tickets whose next_retry_at is due.
// Escalates to 'escalated' after max_attempts and clears next_retry_at.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "crypto";

async function sign(secret: string, ts: string, body: string): Promise<string> {
  return createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

async function notifySupervisor(
  token: string, chatId: string, ticket: { id: string; phone_number: string | null; nlc_number: string | null; facility_address: string | null; emergency_type: string | null; last_error: string | null; attempts: number },
): Promise<void> {
  const text =
    `🚨 <b>Заявка эскалирована</b>\n` +
    `ID: <code>${ticket.id}</code>\n` +
    `Тип: ${ticket.emergency_type ?? "—"}\n` +
    `Телефон: ${ticket.phone_number ?? "—"}\n` +
    `NLC: ${ticket.nlc_number ?? "—"}\n` +
    `Адрес: ${ticket.facility_address ?? "—"}\n` +
    `Попыток: ${ticket.attempts}\n` +
    `Ошибка: ${(ticket.last_error ?? "").slice(0, 200)}`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch { /* best-effort */ }
}

export const Route = createFileRoute("/api/public/hooks/tickets-retry")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();
        const { data: due } = await supabaseAdmin
          .from("tickets")
          .select("id, owner_id, attempts, max_attempts, phone_number, nlc_number, facility_address, emergency_type, caller_comment, call_sid, idempotency_key")
          .in("status", ["pending", "failed"])
          .not("next_retry_at", "is", null)
          .lte("next_retry_at", nowIso)
          .limit(50);

        const results: Array<{ id: string; ok: boolean; reason?: string }> = [];
        for (const t of due ?? []) {
          if ((t.attempts ?? 0) >= (t.max_attempts ?? 5)) {
            await supabaseAdmin.from("tickets").update({
              status: "escalated", escalated_at: nowIso,
              escalation_reason: "max_attempts_reached", next_retry_at: null,
            }).eq("id", t.id);
            results.push({ id: t.id, ok: false, reason: "escalated" });
            continue;
          }
          const { data: cfg } = await supabaseAdmin
            .from("data_residency_configs")
            .select("crm2_enabled, crm2_url, crm2_timeout_ms, hmac_secret")
            .eq("owner_id", t.owner_id)
            .maybeSingle();
          if (!cfg?.crm2_enabled || !cfg.crm2_url) {
            results.push({ id: t.id, ok: false, reason: "disabled" });
            continue;
          }
          const body = JSON.stringify({
            phone_number: t.phone_number, nlc_number: t.nlc_number,
            facility_address: t.facility_address, emergency_type: t.emergency_type,
            caller_comment: t.caller_comment, call_sid: t.call_sid,
            idempotency_key: t.idempotency_key,
          });
          const ts = Math.floor(Date.now() / 1000).toString();
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-CRM-Timestamp": ts,
            "X-Idempotency-Key": t.idempotency_key ?? t.id,
          };
          if (cfg.hmac_secret) headers["X-CRM-Signature"] = await sign(cfg.hmac_secret, ts, body);

          const t0 = Date.now();
          const ctl = new AbortController();
          const tid = setTimeout(() => ctl.abort(), Math.min(Math.max(cfg.crm2_timeout_ms ?? 3000, 1000), 10000));
          let ok = false; let status = 0; let respTxt = ""; let err = "";
          try {
            const r = await fetch(cfg.crm2_url, { method: "POST", headers, body, signal: ctl.signal });
            status = r.status;
            respTxt = await r.text();
            ok = r.ok;
          } catch (e) { err = e instanceof Error ? e.message : String(e); }
          clearTimeout(tid);
          const latency = Date.now() - t0;
          const nextAttempts = (t.attempts ?? 0) + 1;
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(respTxt); } catch { parsed = { raw: respTxt.slice(0, 500) }; }

          if (ok) {
            const externalId = (parsed.ticket_id ?? parsed.id ?? null) as string | number | null;
            await supabaseAdmin.from("tickets").update({
              status: "success", attempts: nextAttempts, latency_ms: latency,
              external_ticket_id: externalId != null ? String(externalId) : null,
              response: parsed as never, last_error: null, next_retry_at: null,
            }).eq("id", t.id);
            results.push({ id: t.id, ok: true });
          } else {
            const escalate = nextAttempts >= (t.max_attempts ?? 5);
            const nextDelayMin = Math.min(60, Math.pow(3, nextAttempts));
            await supabaseAdmin.from("tickets").update({
              status: escalate ? "escalated" : "failed",
              attempts: nextAttempts, latency_ms: latency,
              last_error: err || `http_${status}`, response: parsed as never,
              next_retry_at: escalate ? null : new Date(Date.now() + nextDelayMin * 60_000).toISOString(),
              escalated_at: escalate ? nowIso : null,
              escalation_reason: escalate ? "max_attempts_reached" : null,
            }).eq("id", t.id);
            results.push({ id: t.id, ok: false, reason: err || `http_${status}` });
          }
        }
        return Response.json({ processed: results.length, results });
      },
    },
  },
});
