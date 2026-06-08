import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getRecordingSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { callId: string }) =>
    z.object({ callId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: call, error } = await supabase
      .from("calls")
      .select("recording_path, recording_url, owner_id")
      .eq("id", data.callId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!call || call.owner_id !== userId) throw new Error("Not found");
    if (call.recording_path) {
      const { data: signed, error: sErr } = await supabase.storage
        .from("call-recordings")
        .createSignedUrl(call.recording_path, 60 * 60);
      if (sErr) throw new Error(sErr.message);
      return { url: signed.signedUrl };
    }
    return { url: call.recording_url ?? null };
  });
