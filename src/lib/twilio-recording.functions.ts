import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Manually re-try starting a Twilio recording for a call. Only the call
 * owner may invoke it. Useful when the original start failed silently
 * (no callback ever arrived) and the call is still in progress.
 */
export const retryRecordingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { callId: string }) =>
    z.object({ callId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: call, error } = await supabase
      .from("calls")
      .select("id, owner_id, twilio_call_sid, status")
      .eq("id", data.callId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!call || call.owner_id !== userId) throw new Error("Not found");
    if (!call.twilio_call_sid) {
      return { ok: false as const, error: "Call has no Twilio SID — cannot start recording." };
    }

    const { startTwilioRecording } = await import("@/lib/twilio-recording.server");
    const r = await startTwilioRecording(call.twilio_call_sid);
    return r.ok
      ? { ok: true as const, recordingSid: r.recordingSid }
      : { ok: false as const, error: r.error, status: r.status };
  });
