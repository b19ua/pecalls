// Server-only helper: starts a Twilio dual-channel recording for an in-progress
// call and persists the outcome on the call row so the UI can show status
// (and the user can retry on failure) instead of failing silently.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

export type StartRecordingResult =
  | { ok: true; recordingSid: string }
  | { ok: false; status: number; error: string };

function callbackBase(): string {
  return (
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://project--d7e8c4a9-917e-4bb2-a113-6e70fdf150da.lovable.app"
  );
}

/**
 * Tell Twilio to start recording the live call. Updates the matching
 * `calls` row (`recording_status`, `recording_error`) so we always have a
 * record of what happened, even when the webhook does not fire later.
 */
export async function startTwilioRecording(callSid: string): Promise<StartRecordingResult> {
  const lov = process.env.LOVABLE_API_KEY;
  const tw = process.env.TWILIO_API_KEY;
  if (!lov || !tw) {
    const error = "Twilio credentials are not configured (LOVABLE_API_KEY / TWILIO_API_KEY)";
    await supabaseAdmin
      .from("calls")
      .update({ recording_status: "failed", recording_error: error })
      .eq("twilio_call_sid", callSid);
    return { ok: false, status: 0, error };
  }

  const params = new URLSearchParams({
    RecordingChannels: "dual",
    RecordingStatusCallback: `${callbackBase()}/api/public/twilio/recording`,
    RecordingStatusCallbackMethod: "POST",
    RecordingStatusCallbackEvent: "completed",
  });

  await supabaseAdmin
    .from("calls")
    .update({ recording_status: "requested", recording_error: null })
    .eq("twilio_call_sid", callSid);

  let res: Response;
  try {
    res = await fetch(`${GATEWAY}/Calls/${callSid}/Recordings.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lov}`,
        "X-Connection-Api-Key": tw,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
  } catch (e) {
    const error = `Network error contacting Twilio: ${String(e).slice(0, 300)}`;
    await supabaseAdmin
      .from("calls")
      .update({ recording_status: "failed", recording_error: error })
      .eq("twilio_call_sid", callSid);
    return { ok: false, status: 0, error };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error = `Twilio ${res.status}: ${body.slice(0, 500)}`;
    await supabaseAdmin
      .from("calls")
      .update({ recording_status: "failed", recording_error: error })
      .eq("twilio_call_sid", callSid);

    // Best-effort: also surface in the global error_logs feed.
    try {
      await supabaseAdmin.from("error_logs").insert({
        source: "twilio.recording.start",
        severity: "error",
        message: error,
        call_sid: callSid,
        context: { status: res.status },
      });
    } catch {
      /* best-effort logging */
    }

    return { ok: false, status: res.status, error };
  }

  const data = (await res.json().catch(() => ({}))) as { sid?: string };
  await supabaseAdmin
    .from("calls")
    .update({ recording_status: "recording", recording_error: null })
    .eq("twilio_call_sid", callSid);
  return { ok: true, recordingSid: data.sid ?? "" };
}
