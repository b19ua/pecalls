// Public webhook the client's CRM #2 calls back to report ticket status changes.
// Signed with HMAC-SHA256 (X-CRM-Signature = hex(hmac(hmac_secret, `${ts}.${body}`))) and X-CRM-Timestamp.
// Body: { owner_id: uuid, external_ticket_id: string, status: string, payload?: object }
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const Body = z.object({
  owner_id: z.string().uuid(),
  external_ticket_id: z.string().min(1).max(200),
  status: z.string().min(1).max(50),
  payload: z.record(z.unknown()).optional(),
});

export const Route = createFileRoute("/api/public/crm/ticket-update")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ts = request.headers.get("x-crm-timestamp") ?? "";
        const sig = request.headers.get("x-crm-signature") ?? "";
        const raw = await request.text();
        const drift = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
        if (!ts || !sig || !Number.isFinite(drift) || drift > 300) {
          return new Response("bad timestamp", { status: 401 });
        }
        let parsed: z.infer<typeof Body>;
        try { parsed = Body.parse(JSON.parse(raw)); }
        catch { return new Response("bad body", { status: 400 }); }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfg } = await supabaseAdmin
          .from("data_residency_configs")
          .select("hmac_secret")
          .eq("owner_id", parsed.owner_id)
          .maybeSingle();
        const secret = cfg?.hmac_secret;
        if (!secret) return new Response("owner not configured", { status: 401 });

        const expected = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("bad signature", { status: 401 });
        }

        const { data: id, error } = await supabaseAdmin.rpc("update_ticket_from_webhook", {
          _owner_id: parsed.owner_id,
          _external_ticket_id: parsed.external_ticket_id,
          _status: parsed.status,
          _payload: parsed.payload ?? {},
        });
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true, ticket_id: id });
      },
    },
  },
});
