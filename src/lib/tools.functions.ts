import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildToolRequest, type ToolLite } from "@/lib/tool-request-builder";


const ParamSchema = z.object({
  // `name` stays a clean JS identifier: it is exposed to the LLM as the JSON
  // schema property name AND used as the `{name}` placeholder in body_template.
  name: z.string().min(1).max(40).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  type: z.enum(["string", "number", "boolean"]),
  description: z.string().max(300).default(""),
  required: z.boolean().default(false),
  // Optional override for the outbound HTTP query-string key. Lets any
  // upstream API that requires nested/bracketed keys (Bitrix24
  // `filter[PHONE]`, JSON:API `page[size]`, Elasticsearch `q[term]`, …)
  // work without loosening the identifier regex above. Value is always
  // percent-encoded via URLSearchParams, so brackets/dots/dashes are safe.
  query_key: z.string().max(100).regex(/^[A-Za-z0-9_.\-\[\]]*$/).default(""),
});

const WebhookConfig = z.object({
  url: z.string().url().max(1000),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  auth_header_name: z.string().max(100).default(""),
  auth_header_value: z.string().max(2000).default(""),
  static_headers: z.record(z.string(), z.string().max(1000)).default({}),
  parameters: z.array(ParamSchema).max(20).default([]),
  timeout_ms: z.number().int().min(500).max(30000).default(15000),
  response_hint: z.string().max(2000).default(""),
});

const CrmConfig = z.object({
  provider: z.enum(["hubspot", "salesforce", "bitrix24", "custom"]).default("custom"),
  base_url: z.string().url().max(1000),
  auth_header_name: z.string().max(100).default("Authorization"),
  auth_header_value: z.string().max(2000).default(""),
  path: z.string().max(500).default(""),
  method: z.enum(["GET", "POST", "PUT", "PATCH"]).default("GET"),
  parameters: z.array(ParamSchema).max(20).default([]),
  body_template: z.string().max(4000).default(""),
  timeout_ms: z.number().int().min(500).max(30000).default(15000),
  response_hint: z.string().max(2000).default(""),
});

const ToolSchema = z.object({
  agent_id: z.string().uuid(),
  type: z.enum(["webhook", "crm_lookup", "crm_write"]),
  name: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  description: z.string().max(1000).default(""),
  enabled: z.boolean().default(true),
  config: z.unknown(),
});

function validateConfig(type: string, config: unknown) {
  if (type === "webhook") return WebhookConfig.parse(config);
  return CrmConfig.parse(config);
}

export const listTools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ agentId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("agent_tools")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (data.agentId) q = q.eq("agent_id", data.agentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { tools: rows ?? [] };
  });

export const saveTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid().nullable(), data: ToolSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const config = validateConfig(data.data.type, data.data.config);
    const payload = { ...data.data, config, owner_id: userId };
    if (!data.id) {
      const { data: row, error } = await supabase
        .from("agent_tools")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row!.id };
    }
    const { error } = await supabase
      .from("agent_tools")
      .update(payload)
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

export const deleteTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("agent_tools")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listAgentsForTools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("agents")
      .select("id, name")
      .eq("owner_id", userId)
      .order("name");
    if (error) throw new Error(error.message);
    return { agents: data ?? [] };
  });
