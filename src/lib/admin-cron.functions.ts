import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CronJob = {
  jobid: number; jobname: string | null; schedule: string; command: string; active: boolean;
  database: string; username: string;
};
export type CronRun = {
  jobid: number; runid: number; status: string; return_message: string | null;
  start_time: string; end_time: string | null; command: string;
};

async function assertAdmin(ctx: { supabase: ReturnType<typeof Object> extends never ? never : any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listCronJobsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ jobs: CronJob[] }> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_list_cron_jobs" as never);
    if (error) throw new Error(error.message);
    return { jobs: (data ?? []) as unknown as CronJob[] };
  });

export const listCronRunsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }): Promise<{ runs: CronRun[] }> => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("admin_list_cron_runs" as never, { _limit: data.limit });
    if (error) throw new Error(error.message);
    return { runs: (rows ?? []) as unknown as CronRun[] };
  });

export const setCronActiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ jobid: z.number().int(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.rpc("admin_set_cron_active" as never, { _jobid: data.jobid, _active: data.active });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
