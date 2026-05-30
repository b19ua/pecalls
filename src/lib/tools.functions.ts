import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_EMAIL = "admin@premier.local";
async function getAdminUserId(): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  const u = data.users.find((x) => x.email === ADMIN_EMAIL);
  if (!u) throw new Error("Admin user not found.");
  return u.id;
}

const ParamSchema = z.object({
  name: z.string().min(1).max(40).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  type: z.enum(["string", "number", "boolean"]),
  description: z.string().max(300).default(""),
  required: z.boolean().default(false),
});

const WebhookConfig = z.object({
  url: z.string().url().max(1000),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  auth_header_name: z.string().max(100).default(""),
  auth_header_value: z.string().max(2000).default(""),
  static_headers: z.record(z.string(), z.string().max(1000)).default({}),
  parameters: z.array(ParamSchema).max(20).default([]),
  timeout_ms: z.number().int().min(500).max(20000).default(8000),
  response_hint: z.string().max(500).default(""),
});

const CrmConfig = z.object({
  provider: z.enum(["hubspot", "salesforce", "bitrix24", "custom"]).default("custom"),
  base_url: z.string().url().max(1000),
  auth_header_name: z.string().max(100).default("Authorization"),
  auth_header_value: z.string().max(2000).default(""),
  // for lookup: GET path template, e.g. /contacts/search?phone={phone}
  // for write: POST path template
  path: z.string().max(500).default(""),
  method: z.enum(["GET", "POST", "PUT", "PATCH"]).default("GET"),
  parameters: z.array(ParamSchema).max(20).default([]),
  body_template: z.string().max(4000).default(""),
  timeout_ms: z.number().int().min(500).max(20000).default(8000),
  response_hint: z.string().max(500).default(""),
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
  .inputValidator((i) => z.object({ agentId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data }) => {
    const ownerId = await getAdminUserId();
    let q = supabaseAdmin
      .from("agent_tools")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    if (data.agentId) q = q.eq("agent_id", data.agentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { tools: rows ?? [] };
  });

export const saveTool = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ id: z.string().uuid().nullable(), data: ToolSchema }).parse(i),
  )
  .handler(async ({ data }) => {
    const ownerId = await getAdminUserId();
    const config = validateConfig(data.data.type, data.data.config);
    const payload = { ...data.data, config, owner_id: ownerId };
    if (!data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("agent_tools")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row!.id };
    }
    const { error } = await supabaseAdmin
      .from("agent_tools")
      .update(payload)
      .eq("id", data.id)
      .eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

export const deleteTool = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ownerId = await getAdminUserId();
    const { error } = await supabaseAdmin
      .from("agent_tools")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listAgentsForTools = createServerFn({ method: "GET" }).handler(async () => {
  const ownerId = await getAdminUserId();
  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("id, name")
    .eq("owner_id", ownerId)
    .order("name");
  if (error) throw new Error(error.message);
  return { agents: data ?? [] };
});
