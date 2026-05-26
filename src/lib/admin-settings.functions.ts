import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("admin_email, notify_on_errors, updated_at")
      .eq("id", 1)
      .maybeSingle();
    return data ?? { admin_email: null, notify_on_errors: true, updated_at: null };
  });

export const updateAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      admin_email: z.string().email().nullable(),
      notify_on_errors: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ id: 1, admin_email: data.admin_email, notify_on_errors: data.notify_on_errors, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listErrorLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("error_logs")
      .select("id, source, severity, message, agent_id, call_sid, notified, created_at, context")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });
