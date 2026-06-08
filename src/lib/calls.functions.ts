import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns a playable audio URL for a call.
 * - cloud: signed URL from the call-recordings bucket.
 * - self_hosted: signed URL from the client's gateway.
 */
export const getRecordingSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { callId: string }) =>
    z.object({ callId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: call, error } = await supabase
      .from("calls")
      .select("recording_path, recording_url, owner_id, data_residency, external_call_ref, id")
      .eq("id", data.callId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!call || call.owner_id !== userId) throw new Error("Not found");

    if (call.data_residency === "self_hosted") {
      const { getResidencyConfig, callGateway, isSelfHosted } = await import("@/lib/data-residency.server");
      const cfg = await getResidencyConfig(userId);
      if (!isSelfHosted(cfg)) return { url: null };
      const ref = call.external_call_ref ?? call.id;
      const res = await callGateway<{ audio_url: string | null }>(
        cfg, "GET", `/calls/${encodeURIComponent(ref)}/audio-url`,
      );
      return { url: res.ok ? res.data.audio_url : null };
    }

    if (call.recording_path) {
      const { data: signed, error: sErr } = await supabase.storage
        .from("call-recordings")
        .createSignedUrl(call.recording_path, 60 * 60);
      if (sErr) throw new Error(sErr.message);
      return { url: signed.signedUrl };
    }
    return { url: call.recording_url ?? null };
  });
