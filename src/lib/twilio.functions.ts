import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

function gwHeaders() {
  const lov = process.env.LOVABLE_API_KEY;
  const tw = process.env.TWILIO_API_KEY;
  if (!lov || !tw) throw new Error("Twilio gateway not configured");
  return {
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": tw,
  } as Record<string, string>;
}

async function gwGet(path: string) {
  const r = await fetch(`${GATEWAY}${path}`, { headers: gwHeaders() });
  const data = await r.json();
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

async function gwPost(path: string, body: Record<string, string>) {
  const r = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: { ...gwHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

function publicBaseUrl(_req: Request) {
  // Twilio fetches webhooks from a public, unauthenticated URL.
  // The id-preview--*.lovable.app host is gated by Lovable auth and 302s to
  // an HTML auth-bridge page → Twilio error 11750 (response > 64KB).
  // Always use the stable published project URL for Twilio webhooks.
  const override = process.env.PUBLIC_APP_URL;
  if (override) return override.replace(/\/$/, "");
  return "https://project--d7e8c4a9-917e-4bb2-a113-6e70fdf150da.lovable.app";
}

/** Sync Twilio numbers from account into our cache table */
export const syncTwilioNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const data = await gwGet("/IncomingPhoneNumbers.json?PageSize=200");
    const numbers = (data.incoming_phone_numbers ?? []) as Array<{
      sid: string;
      phone_number: string;
      friendly_name: string;
      capabilities: Record<string, boolean>;
      voice_url: string;
      status_callback: string;
    }>;

    for (const n of numbers) {
      await supabase.from("twilio_numbers").upsert(
        {
          owner_id: userId,
          phone_sid: n.sid,
          phone_e164: n.phone_number,
          friendly_name: n.friendly_name,
          capabilities: n.capabilities ?? {},
          voice_webhook_url: n.voice_url,
          status_callback_url: n.status_callback,
        },
        { onConflict: "phone_sid" },
      );
    }
    return { synced: numbers.length };
  });

/** Configure number to point to our TwiML endpoint and bind to an agent */
export const configureTwilioNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        numberId: z.string().uuid(),
        agentId: z.string().uuid().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getRequest } = await import("@tanstack/react-start/server");
    const base = publicBaseUrl(getRequest());

    const { data: row, error } = await supabase
      .from("twilio_numbers")
      .select("*")
      .eq("id", data.numberId)
      .eq("owner_id", userId)
      .single();
    if (error || !row) throw new Error("Number not found");

    const voiceUrl = `${base}/api/public/twilio/voice?agent_id=${data.agentId ?? ""}`;
    const statusUrl = `${base}/api/public/twilio/status`;

    await gwPost(`/IncomingPhoneNumbers/${row.phone_sid}.json`, {
      VoiceUrl: voiceUrl,
      VoiceMethod: "POST",
      StatusCallback: statusUrl,
      StatusCallbackMethod: "POST",
    });

    await supabase
      .from("twilio_numbers")
      .update({
        agent_id: data.agentId,
        voice_webhook_url: voiceUrl,
        status_callback_url: statusUrl,
      })
      .eq("id", data.numberId);

    return { ok: true, voiceUrl };
  });

/** Place an outbound call */
export const placeOutboundCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        agentId: z.string().uuid(),
        toNumber: z.string().min(5).max(20),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getRequest } = await import("@tanstack/react-start/server");
    const base = publicBaseUrl(getRequest());

    const { data: agent, error: aerr } = await supabase
      .from("agents")
      .select("id, twilio_number_e164")
      .eq("id", data.agentId)
      .eq("owner_id", userId)
      .single();
    if (aerr || !agent) throw new Error("Agent not found");
    if (!agent.twilio_number_e164) throw new Error("Agent has no Twilio number assigned");

    const twiml = await gwPost("/Calls.json", {
      To: data.toNumber,
      From: agent.twilio_number_e164,
      Url: `${base}/api/public/twilio/voice?agent_id=${agent.id}`,
      StatusCallback: `${base}/api/public/twilio/status`,
      StatusCallbackMethod: "POST",
      StatusCallbackEvent: "initiated ringing answered completed",
      Record: "true",
    });

    await supabase.from("calls").insert({
      owner_id: userId,
      agent_id: agent.id,
      twilio_call_sid: twiml.sid,
      direction: "outbound",
      from_number: agent.twilio_number_e164,
      to_number: data.toNumber,
      status: "queued",
    });

    return { sid: twiml.sid };
  });
