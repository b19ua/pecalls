import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_EMAIL = "admin@premier.local";

async function getAdminUserId(): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  const u = data.users.find((x) => x.email === ADMIN_EMAIL);
  if (!u) throw new Error("Admin user not found. Sign in once first.");
  return u.id;
}

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

async function fetchFirstTwilioNumber(): Promise<string | null> {
  const lov = process.env.LOVABLE_API_KEY;
  const tw = process.env.TWILIO_API_KEY;
  if (!lov || !tw) return null;
  try {
    const r = await fetch(`${GATEWAY}/IncomingPhoneNumbers.json?PageSize=1`, {
      headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": tw },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.incoming_phone_numbers?.[0]?.phone_number ?? null;
  } catch {
    return null;
  }
}

const AgentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  greeting: z.string().min(1).max(2000),
  system_prompt: z.string().min(1).max(20000),
  voice: z.string().min(1).max(100),
  language: z.string().min(2).max(20),
  model: z.string().min(1).max(200),
  temperature: z.number().min(0).max(2),
  twilio_number_e164: z.string().nullable().optional(),
  is_active: z.boolean(),
  record_calls: z.boolean(),
  silence_timeout_seconds: z.number().int().min(1).max(120),
  max_call_seconds: z.number().int().min(10).max(7200),
  handoff_enabled: z.boolean(),
  handoff_dtmf_digit: z.string().max(2),
  handoff_trigger_phrases: z.array(z.string().max(200)).max(50),
  handoff_numbers: z.array(z.string().max(20)).max(5),
  outbound_mode: z.enum(["twilio_number", "sip_trunk"]).default("twilio_number"),
  sip_domain: z.string().max(255).nullable().optional(),
  sip_username: z.string().max(255).nullable().optional(),
  sip_password: z.string().max(500).nullable().optional(),
  sip_transport: z.enum(["tls", "tcp", "udp"]).default("tls"),
  sip_from_number: z.string().max(50).nullable().optional(),
  sip_route_prefix: z.string().max(20).nullable().optional(),
});

export const saveAgent = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ id: z.string().uuid().nullable(), data: AgentSchema }).parse(i),
  )
  .handler(async ({ data }) => {
    const ownerId = await getAdminUserId();
    const payload = {
      ...data.data,
      description: data.data.description || null,
      twilio_number_e164: data.data.twilio_number_e164 || null,
      owner_id: ownerId,
    };

    if (!data.id) {
      // Auto-attach first Twilio number on create when none provided
      if (!payload.twilio_number_e164) {
        payload.twilio_number_e164 = await fetchFirstTwilioNumber();
      }
      const { data: row, error } = await supabaseAdmin
        .from("agents")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row!.id };
    }

    const { error } = await supabaseAdmin
      .from("agents")
      .update(payload)
      .eq("id", data.id)
      .eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

export const deleteAgent = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ownerId = await getAdminUserId();
    const { error } = await supabaseAdmin
      .from("agents")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
