// Mock CRM #2 endpoint for testing without a real client CRM.
// Usage: set crm2_url to `https://<host>/api/public/crm/sandbox`.
// Query params:
//   ?fail=1     → always returns 500
//   ?timeout=1  → sleeps 30s to trigger client timeout
//   ?latency=<ms> → adds artificial latency
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/crm/sandbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const latency = Math.min(Number(url.searchParams.get("latency") || 0), 5000);
        if (latency > 0) await new Promise((r) => setTimeout(r, latency));
        if (url.searchParams.get("timeout") === "1") {
          await new Promise((r) => setTimeout(r, 30_000));
        }
        if (url.searchParams.get("fail") === "1") {
          return new Response(JSON.stringify({ error: "sandbox fail" }), { status: 500, headers: { "content-type": "application/json" } });
        }
        const body = await request.text().catch(() => "");
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(body); } catch { /* ignore */ }
        return Response.json({
          ok: true,
          ticket_id: `SBX-${Date.now().toString(36).toUpperCase()}`,
          eta: "24-72h",
          echo: parsed,
        });
      },
    },
  },
});
