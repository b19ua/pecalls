// Centralized error reporter. Stores into error_logs and (if admin email is set
// + RESEND_API_KEY connector secret available) emails the admin.
// CORS open — called from edge functions and clients alike.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const source = String(body.source || "unknown").slice(0, 100);
    const severity = String(body.severity || "error").slice(0, 20);
    const message = String(body.message || "Unspecified error").slice(0, 2000);
    const context = body.context ?? null;
    const agent_id = body.agent_id ?? null;
    const call_sid = body.call_sid ?? null;
    const owner_id = body.owner_id ?? null;

    const { data: row, error } = await supa
      .from("error_logs")
      .insert({ source, severity, message, context, agent_id, call_sid, owner_id })
      .select("id")
      .single();
    if (error) {
      console.error("[report-error] insert failed", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...cors, "content-type": "application/json" },
      });
    }

    // Fetch admin email + notify flag
    const { data: settings } = await supa
      .from("app_settings")
      .select("admin_email, notify_on_errors")
      .eq("id", 1)
      .maybeSingle();

    const adminEmail = settings?.admin_email?.trim();
    if (!adminEmail || !settings?.notify_on_errors) {
      return new Response(JSON.stringify({ ok: true, id: row.id, emailed: false, reason: "no admin email or notifications disabled" }), {
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    // Try to send via Resend connector (preferred). If not configured, leave notified=false.
    let emailed = false;
    if (LOVABLE_KEY && RESEND_KEY) {
      try {
        const html = `
          <h2 style="color:#b91c1c;font-family:system-ui">⚠️ Platform error</h2>
          <p><b>Source:</b> ${escape(source)}</p>
          <p><b>Severity:</b> ${escape(severity)}</p>
          <p><b>Message:</b><br>${escape(message)}</p>
          ${agent_id ? `<p><b>Agent:</b> ${escape(agent_id)}</p>` : ""}
          ${call_sid ? `<p><b>Call SID:</b> ${escape(call_sid)}</p>` : ""}
          ${context ? `<pre style="background:#f5f5f5;padding:8px;border-radius:6px;font-size:12px;overflow:auto">${escape(JSON.stringify(context, null, 2))}</pre>` : ""}
          <p style="color:#666;font-size:12px">Logged at ${new Date().toISOString()}</p>
        `;
        const r = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_KEY}`,
            "X-Connection-Api-Key": RESEND_KEY,
          },
          body: JSON.stringify({
            from: "Voice AI Platform <onboarding@resend.dev>",
            to: [adminEmail],
            subject: `[Voice AI] ${severity.toUpperCase()}: ${message.slice(0, 80)}`,
            html,
          }),
        });
        emailed = r.ok;
        if (!r.ok) console.error("[report-error] resend failed", r.status, await r.text());
      } catch (e) {
        console.error("[report-error] resend exception", e);
      }
    }

    if (emailed) {
      await supa.from("error_logs").update({ notified: true }).eq("id", row.id);
    }

    return new Response(JSON.stringify({ ok: true, id: row.id, emailed }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[report-error] fatal", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});

function escape(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));
}
