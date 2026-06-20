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
