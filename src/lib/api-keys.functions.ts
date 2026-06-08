import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, prefix, agent_id, scopes, last_used_at, revoked_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { keys: data ?? [] };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; agentId?: string | null; scopes?: string[] }) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        agentId: z.string().uuid().nullable().optional(),
        scopes: z.array(z.enum(["calls:read", "calls:write"])).min(1).max(4).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const raw = randomToken(32);
    const prefix = "lnr_" + raw.slice(0, 6);
    const fullKey = prefix + "_" + raw.slice(6);
    const key_hash = await sha256Hex(fullKey);
    const { data: row, error } = await supabase
      .from("api_keys")
      .insert({
        owner_id: userId,
        name: data.name,
        prefix,
        key_hash,
        agent_id: data.agentId ?? null,
        scopes: data.scopes ?? ["calls:read"],
      })
      .select("id, name, prefix, agent_id, scopes, created_at, revoked_at, last_used_at")
      .single();
    if (error) throw new Error(error.message);
    return { key: row, plaintext: fullKey };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("api_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
