import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AgentSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).default(""),
  system_prompt: z.string().max(8000).default(""),
  language: z.enum(["ru", "ro", "en"]).default("ru"),
  enabled: z.boolean().default(true),
  suggestion_categories: z.array(z.string().max(40)).max(20).default([
    "objection", "upsell", "compliance", "emotion", "next_step",
  ]),
  knowledge_hint: z.string().max(4000).default(""),
  product_context: z.string().max(4000).default(""),
  competitor_context: z.string().max(4000).default(""),
  pricing_context: z.string().max(4000).default(""),
  twilio_number_id: z.string().uuid().nullable().optional(),
  channel_binding: z.string().max(200).default(""),
  emotion_tracking_enabled: z.boolean().default(true),
  objection_handling_enabled: z.boolean().default(true),
  min_suggestion_interval_ms: z.number().int().min(1000).max(30000).default(4000),
});

export const listCopilotAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("copilot_agents")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { agents: data ?? [] };
  });

export const getCopilotAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("copilot_agents")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", userId)
      .single();
    if (error) throw new Error(error.message);
    return { agent: row };
  });

export const saveCopilotAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid().nullable(), data: AgentSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = { ...data.data, owner_id: userId };
    if (!data.id) {
      const { data: row, error } = await supabase
        .from("copilot_agents")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }
    const { error } = await supabase
      .from("copilot_agents")
      .update(payload)
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

export const deleteCopilotAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("copilot_agents")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCopilotSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ status: z.enum(["active", "ended", "all"]).default("all") }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("copilot_sessions")
      .select("*")
      .eq("owner_id", userId)
      .order("started_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { sessions: rows ?? [] };
  });

export const getCopilotSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: session, error: e1 }, { data: suggestions }, { data: transcript }] =
      await Promise.all([
        supabase.from("copilot_sessions").select("*").eq("id", data.id).eq("owner_id", userId).single(),
        supabase.from("copilot_suggestions").select("*").eq("session_id", data.id).order("ts", { ascending: true }),
        supabase.from("copilot_transcript").select("*").eq("session_id", data.id).order("ts", { ascending: true }),
      ]);
    if (e1) throw new Error(e1.message);
    return { session, suggestions: suggestions ?? [], transcript: transcript ?? [] };
  });

export const acknowledgeSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), used: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("copilot_suggestions")
      .update({ acknowledged: true, used: data.used })
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────
// TEST CALL — Sales Demo
// Initiates outbound Twilio call to user's phone with TwiML pointing at the
// copilot test endpoint. The dashboard immediately shows the live session,
// transcript and AI suggestions stream as the user talks.
// ─────────────────────────────────────────────────────────────────────────

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

function publicBaseUrl(): string {
  const envUrl = process.env.COPILOT_PUBLIC_BASE_URL || process.env.PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const projectId = process.env.SUPABASE_PROJECT_ID || process.env.VITE_SUPABASE_PROJECT_ID;
  if (projectId) return `https://project--${projectId}.lovable.app`;
  return "https://pecalls.lovable.app";
}

export const startCopilotTestCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        agentId: z.string().uuid(),
        phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Используйте E.164: +37360123456"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const lov = process.env.LOVABLE_API_KEY;
    const tw = process.env.TWILIO_API_KEY;
    if (!lov || !tw) throw new Error("Twilio не подключён. Подключите Twilio в Connectors.");

    const { data: agent, error: aErr } = await supabase
      .from("copilot_agents")
      .select("*")
      .eq("id", data.agentId)
      .eq("owner_id", userId)
      .single();
    if (aErr || !agent) throw new Error("Copilot-агент не найден");
    if (!agent.enabled) throw new Error("Агент выключен — включите его перед тестовым звонком");

    // Pick a From number: agent.twilio_number_id → fallback to first owned number.
    let fromNumber: string | null = null;
    if (agent.twilio_number_id) {
      const { data: n } = await supabase
        .from("twilio_numbers")
        .select("phone_e164")
        .eq("id", agent.twilio_number_id)
        .eq("owner_id", userId)
        .maybeSingle();
      fromNumber = (n as { phone_e164?: string } | null)?.phone_e164 ?? null;
    }
    if (!fromNumber) {
      const { data: nums } = await supabase
        .from("twilio_numbers")
        .select("phone_e164")
        .eq("owner_id", userId)
        .limit(1);
      fromNumber = (nums as Array<{ phone_e164: string }> | null)?.[0]?.phone_e164 ?? null;
    }
    if (!fromNumber) throw new Error("Не найден Twilio-номер. Подключите номер в разделе Telephony.");

    // Create session up-front so dashboard shows the call instantly.
    const { data: session, error: sErr } = await supabase
      .from("copilot_sessions")
      .insert({
        owner_id: userId,
        agent_id: agent.id,
        manager_name: "Test Call",
        customer_phone: data.phone,
        status: "active",
        is_test: true,
      })
      .select("id")
      .single();
    if (sErr || !session) throw new Error(sErr?.message || "Не удалось создать сессию");

    const base = publicBaseUrl();
    const twimlUrl = `${base}/api/public/twilio/copilot-test-twiml?agent_id=${encodeURIComponent(agent.id)}&session_id=${encodeURIComponent(session.id)}&lang=${encodeURIComponent(agent.language || "ru")}`;

    const params = new URLSearchParams();
    params.append("To", data.phone);
    params.append("From", fromNumber);
    params.append("Url", twimlUrl);
    params.append("Method", "POST");
    params.append("Timeout", "30");

    const r = await fetch(`${GATEWAY}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lov}`,
        "X-Connection-Api-Key": tw,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const body = await r.json();
    if (!r.ok) {
      await supabase
        .from("copilot_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString(), summary: `Ошибка запуска: ${JSON.stringify(body)}` })
        .eq("id", session.id);
      throw new Error(`Twilio ${r.status}: ${(body as { message?: string }).message || JSON.stringify(body)}`);
    }

    // Save Twilio CallSid back onto the session.
    const callSid = (body as { sid?: string }).sid;
    if (callSid) {
      await supabase.from("copilot_sessions").update({ call_sid: callSid }).eq("id", session.id);
    }

    return { sessionId: session.id, callSid: callSid ?? null };
  });
