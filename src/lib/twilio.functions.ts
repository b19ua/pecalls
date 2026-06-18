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

async function gwPost(path: string, body: Record<string, string | string[]>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) v.forEach((vv) => params.append(k, vv));
    else params.append(k, v);
  }
  const r = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: { ...gwHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

async function gwPostAllowEmpty(path: string, body: Record<string, string | string[] | null | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) {
      v.forEach((vv) => params.append(k, vv));
      continue;
    }
    params.append(k, v ?? "");
  }
  const r = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: { ...gwHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
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
  return "https://pecalls.lovable.app";
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

    await gwPostAllowEmpty(`/IncomingPhoneNumbers/${row.phone_sid}.json`, {
      VoiceUrl: voiceUrl,
      VoiceMethod: "POST",
      StatusCallback: statusUrl,
      StatusCallbackMethod: "POST",
      VoiceApplicationSid: "",
      TrunkSid: "",
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

function genPassword(len = 28) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
}

function genSlug() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
}

/** Provision a per-agent Twilio SIP Domain so the customer can route inbound SIP calls to the agent */
export const provisionInboundSip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ agentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getRequest } = await import("@tanstack/react-start/server");
    const base = publicBaseUrl(getRequest());

    const { data: agent, error } = await supabase
      .from("agents")
      .select("id, inbound_sip_slug, inbound_sip_domain, inbound_sip_domain_sid, inbound_sip_username, inbound_sip_password, inbound_sip_credential_list_sid")
      .eq("id", data.agentId)
      .eq("owner_id", userId)
      .single();
    if (error || !agent) throw new Error("Agent not found");

    const slug = agent.inbound_sip_slug || `agent-${genSlug()}`;
    const desired = `${slug}.sip.twilio.com`;
    const voiceUrl = `${base}/api/public/twilio/voice?agent_id=${agent.id}`;
    const statusUrl = `${base}/api/public/twilio/status`;

    // 1) Find or create SIP Domain
    let domainSid = agent.inbound_sip_domain_sid as string | null;
    let domainName = agent.inbound_sip_domain as string | null;
    if (!domainSid) {
      const list = await gwGet(`/SIP/Domains.json?PageSize=200`);
      const existing = (list.domains || []).find((d: { domain_name: string; sid: string }) => d.domain_name === desired);
      if (existing) {
        domainSid = existing.sid;
        domainName = existing.domain_name;
        await gwPostAllowEmpty(`/SIP/Domains/${domainSid}.json`, {
          VoiceUrl: voiceUrl,
          VoiceMethod: "POST",
          VoiceStatusCallbackUrl: statusUrl,
          VoiceStatusCallbackMethod: "POST",
        });
      } else {
        const created = await gwPost(`/SIP/Domains.json`, {
          DomainName: desired,
          FriendlyName: `Agent ${agent.id.slice(0, 8)}`,
          VoiceUrl: voiceUrl,
          VoiceMethod: "POST",
          VoiceStatusCallbackUrl: statusUrl,
          VoiceStatusCallbackMethod: "POST",
        });
        domainSid = created.sid;
        domainName = created.domain_name;
      }
    } else {
      // refresh voice url in case base url changed
      await gwPostAllowEmpty(`/SIP/Domains/${domainSid}.json`, {
        VoiceUrl: voiceUrl,
        VoiceMethod: "POST",
        VoiceStatusCallbackUrl: statusUrl,
        VoiceStatusCallbackMethod: "POST",
      });
    }

    // 2) Credential list + credential
    const username = agent.inbound_sip_username || `agent_${slug.replace(/^agent-/, "")}`;
    const password = agent.inbound_sip_password || genPassword(28);
    let credListSid = agent.inbound_sip_credential_list_sid as string | null;

    if (!credListSid) {
      const friendlyName = `Agent ${agent.id.slice(0, 8)} SIP`;
      // Reuse existing CredentialList with same FriendlyName (e.g. leftover from prior provisioning)
      const existingLists = await gwGet(`/SIP/CredentialLists.json?PageSize=200`);
      const existingList = (existingLists.credential_lists || []).find(
        (cl: { friendly_name: string; sid: string }) => cl.friendly_name === friendlyName,
      );
      if (existingList) {
        credListSid = existingList.sid;
      } else {
        const cl = await gwPost(`/SIP/CredentialLists.json`, { FriendlyName: friendlyName });
        credListSid = cl.sid;
      }
      // Ensure credential exists (ignore "already exists" errors)
      try {
        await gwPost(`/SIP/CredentialLists/${credListSid}/Credentials.json`, {
          Username: username,
          Password: password,
        });
      } catch (e) {
        const msg = String((e as Error).message || "");
        if (!/already exists|22122|already in use/i.test(msg)) throw e;
      }
      // Map credential list to SIP Domain — ignore if mapping already exists
      try {
        await gwPost(`/SIP/Domains/${domainSid}/Auth/Calls/CredentialListMappings.json`, {
          CredentialListSid: credListSid as string,
        });
      } catch (e) {
        const msg = String((e as Error).message || "");
        if (!/already|exists/i.test(msg)) throw e;
      }
    }

    await supabase
      .from("agents")
      .update({
        inbound_sip_slug: slug,
        inbound_sip_domain: domainName,
        inbound_sip_domain_sid: domainSid,
        inbound_sip_username: username,
        inbound_sip_password: password,
        inbound_sip_credential_list_sid: credListSid,
      })
      .eq("id", agent.id);

    return {
      sip_domain: domainName,
      sip_uri: `sip:${slug}@${domainName}`,
      username,
      password,
      voice_url: voiceUrl,
    };
  });

async function gwDelete(path: string) {
  const r = await fetch(`${GATEWAY}${path}`, { method: "DELETE", headers: gwHeaders() });
  if (!r.ok && r.status !== 404) {
    const text = await r.text();
    throw new Error(`Twilio DELETE ${path} ${r.status}: ${text}`);
  }
}

/** Remove the inbound SIP domain & credentials for an agent */
export const deleteInboundSip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ agentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: agent, error } = await supabase
      .from("agents")
      .select("id, inbound_sip_domain_sid, inbound_sip_credential_list_sid")
      .eq("id", data.agentId)
      .eq("owner_id", userId)
      .single();
    if (error || !agent) throw new Error("Agent not found");

    if (agent.inbound_sip_domain_sid) {
      await gwDelete(`/SIP/Domains/${agent.inbound_sip_domain_sid}.json`);
    }
    if (agent.inbound_sip_credential_list_sid) {
      await gwDelete(`/SIP/CredentialLists/${agent.inbound_sip_credential_list_sid}.json`);
    }

    await supabase
      .from("agents")
      .update({
        inbound_sip_slug: null,
        inbound_sip_domain: null,
        inbound_sip_domain_sid: null,
        inbound_sip_username: null,
        inbound_sip_password: null,
        inbound_sip_credential_list_sid: null,
      })
      .eq("id", agent.id);

    return { ok: true };
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
      .select("id, twilio_number_e164, outbound_mode, sip_domain, sip_username, sip_password, sip_transport, sip_from_number, sip_route_prefix")
      .eq("id", data.agentId)
      .eq("owner_id", userId)
      .single();
    if (aerr || !agent) throw new Error("Agent not found");

    const useSip = agent.outbound_mode === "sip_trunk" && agent.sip_domain;
    const fromNumber = useSip
      ? (agent.sip_from_number || agent.twilio_number_e164)
      : agent.twilio_number_e164;
    if (!fromNumber) throw new Error("Agent has no caller-ID number assigned (Twilio number or SIP From)");

    const transport = (agent.sip_transport || "tls").toLowerCase();
    const prefix = (agent.sip_route_prefix || "").trim();
    const normalizedTo = data.toNumber.trim();
    const sipUser = useSip
      ? prefix
        ? `${prefix}${normalizedTo.replace(/^\+/, "")}`
        : normalizedTo
      : "";
    const toParam = useSip
      ? `sip:${sipUser}@${agent.sip_domain}${transport ? `;transport=${transport}` : ""}`
      : data.toNumber;


    const callBody: Record<string, string | string[]> = {
      To: toParam,
      From: fromNumber,
      Url: `${base}/api/public/twilio/voice?agent_id=${agent.id}`,
      StatusCallback: `${base}/api/public/twilio/status`,
      StatusCallbackMethod: "POST",
      StatusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      Record: "true",
    };
    if (useSip && agent.sip_username) callBody.SipAuthUsername = agent.sip_username;
    if (useSip && agent.sip_password) callBody.SipAuthPassword = agent.sip_password;

    const twiml = await gwPost("/Calls.json", callBody);

    await supabase.from("calls").insert({
      owner_id: userId,
      agent_id: agent.id,
      twilio_call_sid: twiml.sid,
      direction: "outbound",
      from_number: fromNumber,
      to_number: data.toNumber,
      status: "queued",
    });

    return { sid: twiml.sid };
  });
