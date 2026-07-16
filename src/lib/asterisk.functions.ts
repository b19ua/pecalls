import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * placeAsteriskCall — исходящий звонок через локальный Asterisk (ARI).
 * Диалплан клиента должен направить канал в Stasis(app) и передать
 * переменную канала LUNARA_UUID как UUID для AudioSocket.
 */
export const placeAsteriskCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        agentId: z.string().uuid(),
        toNumber: z.string().min(3).max(64),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: agent, error } = await supabase
      .from("agents")
      .select(
        "id, telephony_provider, asterisk_ari_base_url, asterisk_ari_username, asterisk_ari_password, asterisk_ari_app, asterisk_trunk, asterisk_caller_id, asterisk_audiosocket_host",
      )
      .eq("id", data.agentId)
      .eq("owner_id", userId)
      .single();
    if (error || !agent) throw new Error("Агент не найден");
    if (agent.telephony_provider !== "asterisk") {
      throw new Error("У агента выбран не asterisk-режим");
    }
    const ariUrl = (agent.asterisk_ari_base_url || "").replace(/\/+$/, "");
    if (!ariUrl || !agent.asterisk_ari_username || !agent.asterisk_ari_password) {
      throw new Error("ARI не настроен (base URL / user / password)");
    }
    if (!agent.asterisk_trunk) throw new Error("Не задан PSTN trunk");
    if (!agent.asterisk_ari_app) throw new Error("Не задан Stasis app");

    const callUuid = crypto.randomUUID();
    // pre-insert call row (provider-agnostic sid)
    const { error: insErr } = await supabase.from("calls").insert({
      owner_id: userId,
      agent_id: agent.id,
      twilio_call_sid: callUuid,
      status: "queued",
      direction: "outbound",
      to_number: data.toNumber,
    });
    if (insErr) throw new Error(insErr.message);

    const endpoint = `${agent.asterisk_trunk}/${data.toNumber}`;
    const body = {
      endpoint,
      app: agent.asterisk_ari_app,
      appArgs: callUuid,
      callerId: agent.asterisk_caller_id || undefined,
      variables: {
        LUNARA_UUID: callUuid,
        LUNARA_BRIDGE_HOST: agent.asterisk_audiosocket_host || "",
      },
    };
    const auth = btoa(`${agent.asterisk_ari_username}:${agent.asterisk_ari_password}`);
    let resp: Response;
    try {
      resp = await fetch(`${ariUrl}/ari/channels`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      await supabase.from("calls").update({ status: "failed" }).eq("twilio_call_sid", callUuid);
      throw new Error(`Нет связи с Asterisk ARI: ${(e as Error).message}`);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      await supabase.from("calls").update({ status: "failed" }).eq("twilio_call_sid", callUuid);
      throw new Error(`ARI ${resp.status}: ${text || resp.statusText}`);
    }
    return { callId: callUuid };
  });
