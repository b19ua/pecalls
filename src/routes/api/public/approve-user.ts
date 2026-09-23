import { createFileRoute } from "@tanstack/react-router";

function page(title: string, message: string, ok: boolean) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b1220;color:#e8eefc}
.card{max-width:440px;padding:36px;border-radius:18px;background:#121c31;border:1px solid #22314f;text-align:center}
h1{font-size:20px;margin:0 0 10px}p{margin:0;color:#9db0d0;font-size:14px;line-height:1.6}
.dot{width:44px;height:44px;border-radius:50%;margin:0 auto 18px;background:${ok ? "#12b981" : "#ef4444"}}
a{display:inline-block;margin-top:22px;color:#7dd3fc;text-decoration:none;font-size:14px}
</style></head><body><div class="card"><div class="dot"></div>
<h1>${title}</h1><p>${message}</p><a href="/">Open Lunara</a></div></body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/approve-user")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const action = url.searchParams.get("action") === "reject" ? "reject" : "approve";
        if (!token) return page("Invalid link", "This approval link is missing its token.", false);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("user_approval_tokens")
          .select("user_id, email, used_at, expires_at")
          .eq("token", token)
          .maybeSingle();

        if (!row) return page("Invalid link", "This approval link is not valid.", false);
        if (row.used_at) return page("Already handled", `The request for ${row.email ?? "this user"} was already processed.`, true);
        if (new Date(row.expires_at) < new Date())
          return page("Link expired", "Approve this account from the admin users page instead.", false);

        const approved = action === "approve";
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            approval_status: approved ? "approved" : "rejected",
            approved_at: approved ? new Date().toISOString() : null,
          })
          .eq("user_id", row.user_id);
        if (error) return page("Something went wrong", error.message, false);

        await supabaseAdmin
          .from("user_approval_tokens")
          .update({ used_at: new Date().toISOString() })
          .eq("token", token);

        return approved
          ? page("Account approved", `${row.email ?? "The user"} can now sign in and use Lunara.`, true)
          : page("Account rejected", `${row.email ?? "The user"} will stay blocked from the platform.`, true);
      },
    },
  },
});
