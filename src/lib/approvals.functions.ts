import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const APPROVAL_NOTIFY_EMAIL = "lunara9897@gmail.com";

function siteUrl() {
  return process.env.SITE_URL || "https://lunara.now";
}

async function assertAdmin(ctx: { supabase: unknown; userId: string }) {
  const { data, error } = await (ctx.supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>;
  }).rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error("Role check failed");
  if (!data) throw new Error("Forbidden");
}

/**
 * Called right after sign-up. Creates (or reuses) a one-click approval token for
 * the pending account and notifies the platform owner.
 */
export const requestApprovalFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, display_name, approval_status")
      .eq("email", email)
      .maybeSingle();

    if (!profile) return { ok: true as const };
    if (profile.approval_status === "approved") return { ok: true as const, approved: true };

    const { data: existing } = await supabaseAdmin
      .from("user_approval_tokens")
      .select("token")
      .eq("user_id", profile.user_id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    let token = existing?.token as string | undefined;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const { error } = await supabaseAdmin
        .from("user_approval_tokens")
        .insert({ user_id: profile.user_id, token, email: profile.email });
      if (error) throw new Error(error.message);
    }

    const approveUrl = `${siteUrl()}/api/public/approve-user?token=${token}&action=approve`;
    const rejectUrl = `${siteUrl()}/api/public/approve-user?token=${token}&action=reject`;

    await notifyOwner({
      email: profile.email ?? email,
      displayName: profile.display_name,
      approveUrl,
      rejectUrl,
    });

    return { ok: true as const };
  });

async function notifyOwner(p: {
  email: string;
  displayName: string | null;
  approveUrl: string;
  rejectUrl: string;
}) {
  const subject = `New Lunara signup awaiting approval: ${p.email}`;
  const body =
    `New account request\n\nEmail: ${p.email}\nName: ${p.displayName ?? "—"}\n\n` +
    `Approve: ${p.approveUrl}\nReject: ${p.rejectUrl}\n`;

  // Always keep an audit trail so the approval link is never lost,
  // even if outbound email is not configured yet.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("error_logs").insert({
      source: "signup-approval",
      severity: "info",
      message: subject,
      context: { to: APPROVAL_NOTIFY_EMAIL, approve_url: p.approveUrl, reject_url: p.rejectUrl },
    });
  } catch (e) {
    console.error("[approval] audit log failed", e);
  }

  // Outbound email via the project's transactional email route (if configured).
  try {
    const res = await fetch(`${siteUrl()}/lovable/email/transactional/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateName: "signup-approval",
        recipientEmail: APPROVAL_NOTIFY_EMAIL,
        idempotencyKey: `signup-approval-${p.email}`,
        templateData: {
          email: p.email,
          displayName: p.displayName,
          approveUrl: p.approveUrl,
          rejectUrl: p.rejectUrl,
        },
      }),
    });
    if (!res.ok) console.warn("[approval] email not sent:", res.status, body);
  } catch (e) {
    console.warn("[approval] email transport unavailable", e);
  }
}

export type PendingUser = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  approval_status: string;
  created_at: string;
  approved_at: string | null;
  approve_url: string | null;
};

export const listApprovalUsersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: PendingUser[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, display_name, approval_status, created_at, approved_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const { data: tokens } = await supabaseAdmin
      .from("user_approval_tokens")
      .select("user_id, token, used_at, expires_at");
    const tokenByUser = new Map<string, string>();
    for (const t of tokens ?? []) {
      if (!t.used_at && new Date(t.expires_at) > new Date()) tokenByUser.set(t.user_id, t.token);
    }

    return {
      users: (profiles ?? []).map((p) => ({
        user_id: p.user_id,
        email: p.email,
        display_name: p.display_name,
        approval_status: p.approval_status ?? "pending",
        created_at: p.created_at,
        approved_at: p.approved_at,
        approve_url: tokenByUser.has(p.user_id)
          ? `${siteUrl()}/api/public/approve-user?token=${tokenByUser.get(p.user_id)}&action=approve`
          : null,
      })),
    };
  });

export const setApprovalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), status: z.enum(["approved", "pending", "rejected"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        approval_status: data.status,
        approved_at: data.status === "approved" ? new Date().toISOString() : null,
        approved_by: data.status === "approved" ? context.userId : null,
      })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    if (data.status === "approved") {
      await supabaseAdmin
        .from("user_approval_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("user_id", data.user_id)
        .is("used_at", null);
    }
    return { ok: true };
  });

export const getMyApprovalFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("approval_status")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { status: (data?.approval_status as string | undefined) ?? "pending" };
  });
