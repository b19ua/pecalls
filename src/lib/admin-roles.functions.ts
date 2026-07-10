import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["admin", "supervisor", "user"] as const;
type AppRole = (typeof ROLES)[number];

async function assertAdmin(ctx: { supabase: ReturnType<typeof Object>; userId: string }) {
  const { data, error } = await (ctx.supabase as never as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>;
  }).rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error("Role check failed");
  if (!data) throw new Error("Forbidden");
}

export const getMyRolesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ roles: AppRole[] }> => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    return { roles: (data ?? []).map((r) => r.role as AppRole) };
  });

type UserRow = { user_id: string; email: string | null; display_name: string | null; roles: AppRole[] };

export const listUsersWithRolesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: UserRow[] }> => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, email, display_name")
      .order("email", { ascending: true })
      .limit(500);
    if (pErr) throw new Error(pErr.message);
    const { data: roles, error: rErr } = await supabase.from("user_roles").select("user_id, role");
    if (rErr) throw new Error(rErr.message);
    const byUser = new Map<string, AppRole[]>();
    for (const r of roles ?? []) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      byUser.set(r.user_id, arr);
    }
    return {
      users: (profiles ?? []).map((p) => ({
        user_id: p.user_id,
        email: p.email,
        display_name: p.display_name,
        roles: byUser.get(p.user_id) ?? [],
      })),
    };
  });

const MutateInput = z.object({
  user_id: z.string().uuid(),
  role: z.enum(ROLES),
});

export const assignRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MutateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MutateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.user_id && data.role === "admin") {
      throw new Error("Нельзя снять собственную роль admin");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
