import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

const TG_API = "https://api.telegram.org";

function webhookSecretFor(token: string) {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function tgSend(token: string, chatId: number, text: string) {
  await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  }).catch(() => {});
}

async function tgAction(token: string, chatId: number, action: string) {
  await fetch(`${TG_API}/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => {});
}

async function aiReply(systemPrompt: string, userText: string, language: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nОтвечай на языке: ${language}. Кратко, дружелюбно, в формате чата.`,
        },
        { role: "user", content: userText },
      ],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`AI ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.choices?.[0]?.message?.content ?? "…";
}

export const Route = createFileRoute("/api/public/telegram/webhook/$agentId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("id, system_prompt, greeting, language, telegram_bot_token, is_active")
          .eq("id", params.agentId)
          .maybeSingle();

        if (!agent || !agent.telegram_bot_token) {
          return new Response("Not found", { status: 404 });
        }

        const expected = webhookSecretFor(agent.telegram_bot_token);
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!safeEqual(got, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json().catch(() => null) as any;
        const msg = update?.message ?? update?.edited_message;
        const chatId = msg?.chat?.id;
        const text = msg?.text as string | undefined;
        if (!chatId || !text) return Response.json({ ok: true, ignored: true });

        if (!agent.is_active) {
          await tgSend(agent.telegram_bot_token, chatId, "Бот временно отключён.");
          return Response.json({ ok: true });
        }

        // /start → greeting
        if (text.trim() === "/start") {
          await tgSend(agent.telegram_bot_token, chatId, agent.greeting || "Здравствуйте!");
          return Response.json({ ok: true });
        }

        await tgAction(agent.telegram_bot_token, chatId, "typing");

        try {
          const reply = await aiReply(agent.system_prompt, text, agent.language || "ru-RU");
          await tgSend(agent.telegram_bot_token, chatId, reply);
        } catch (e) {
          console.error("telegram ai error", e);
          await tgSend(agent.telegram_bot_token, chatId, "Извините, временная ошибка. Попробуйте позже.");
        }

        return Response.json({ ok: true });
      },
    },
  },
});
