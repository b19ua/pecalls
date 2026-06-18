import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TG_API = "https://api.telegram.org";

function webhookSecretFor(token: string) {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}

function publicBaseUrl() {
  const override = process.env.PUBLIC_APP_URL;
  if (override) return override.replace(/\/$/, "");
  return "https://pecalls.lovable.app";
}

async function tg(token: string, method: string, body?: unknown) {
  const r = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  const data = await r.json();
  if (!r.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || r.status}`);
  }
  return data.result;
}

export const connectTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        agentId: z.string().uuid(),
        token: z.string().trim().regex(/^\d{6,12}:[A-Za-z0-9_-]{30,}$/, "Неверный формат токена"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: agent, error } = await supabase
      .from("agents")
      .select("id")
      .eq("id", data.agentId)
      .eq("owner_id", userId)
      .single();
    if (error || !agent) throw new Error("Agent not found");

    // Validate token + get bot info
    const me = await tg(data.token, "getMe");

    // Register webhook
    const url = `${publicBaseUrl()}/api/public/telegram/webhook/${data.agentId}`;
    const secret = webhookSecretFor(data.token);
    await tg(data.token, "setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: true,
    });

    await supabase
      .from("agents")
      .update({
        telegram_bot_token: data.token,
        telegram_bot_username: me.username,
        telegram_bot_id: me.id,
      })
      .eq("id", data.agentId);

    return { username: me.username as string, id: me.id as number };
  });

export const disconnectTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ agentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: agent } = await supabase
      .from("agents")
      .select("telegram_bot_token")
      .eq("id", data.agentId)
      .eq("owner_id", userId)
      .single();

    if (agent?.telegram_bot_token) {
      try { await tg(agent.telegram_bot_token, "deleteWebhook", { drop_pending_updates: true }); }
      catch { /* ignore */ }
    }

    await supabase
      .from("agents")
      .update({
        telegram_bot_token: null,
        telegram_bot_username: null,
        telegram_bot_id: null,
      })
      .eq("id", data.agentId);

    return { ok: true };
  });
