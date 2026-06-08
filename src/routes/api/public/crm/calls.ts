import { createFileRoute } from "@tanstack/react-router";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export const Route = createFileRoute("/api/public/crm/calls")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") || request.headers.get("Authorization");
        const token = auth?.toLowerCase().startsWith("bearer ")
          ? auth.slice(7).trim()
          : request.headers.get("x-api-key")?.trim();
        if (!token) return json({ error: "Missing API key" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const key_hash = await sha256Hex(token);
        const { data: keyRow, error: keyErr } = await supabaseAdmin
          .from("api_keys")
          .select("id, owner_id, agent_id, scopes, revoked_at")
          .eq("key_hash", key_hash)
          .maybeSingle();
        if (keyErr) return json({ error: "Auth error" }, 500);
        if (!keyRow || keyRow.revoked_at) return json({ error: "Invalid or revoked key" }, 401);
        if (!keyRow.scopes?.includes("calls:read")) return json({ error: "Insufficient scope" }, 403);

        const url = new URL(request.url);
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
        const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
        const since = url.searchParams.get("since");
        const callId = url.searchParams.get("id");
        const phone = url.searchParams.get("phone");

        let q = supabaseAdmin
          .from("calls")
          .select(
            "id, agent_id, direction, from_number, to_number, status, started_at, ended_at, duration_seconds, summary, transcript, recording_url, cost_usd, handoff_to, created_at",
          )
          .eq("owner_id", keyRow.owner_id)
          .order("started_at", { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);

        if (keyRow.agent_id) q = q.eq("agent_id", keyRow.agent_id);
        if (callId) q = q.eq("id", callId);
        if (since) q = q.gte("started_at", since);
        if (phone) q = q.or(`from_number.ilike.%${phone}%,to_number.ilike.%${phone}%`);

        const { data, error } = await q;
        if (error) return json({ error: error.message }, 500);

        // Best-effort last_used_at update
        supabaseAdmin
          .from("api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", keyRow.id)
          .then(() => {});

        return json({
          calls: data ?? [],
          pagination: { limit, offset, count: data?.length ?? 0 },
          scope: { agent_id: keyRow.agent_id },
        });
      },
    },
  },
});
