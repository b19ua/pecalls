// pg_cron-invoked endpoint: audits recently ended calls to detect mismatches
// between the transcript (customer clearly asked to open an emergency ticket)
// and whether a ticket row was actually created in the last 30 minutes.
// Flags mismatches to public.error_logs so supervisors can follow up.
//
// Uses Gemini 2.5 Flash via Lovable AI Gateway for accurate intent detection,
// falling back to a regex prefilter when the LLM is unavailable.
import { createFileRoute } from "@tanstack/react-router";

const REGEX_PREFILTER = /(заявк|аварий|отключ|нет света|отключили свет|без электрич|no light|outage|no power|panǎ|pană|deconect|fara curent|fără curent)/i;

async function detectTicketIntentLLM(
  text: string,
): Promise<{ intent: boolean; confidence: number; reason: string } | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key || !text.trim()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You classify call transcripts for an emergency-services CRM. Reply with strict JSON only: {\"intent\":boolean,\"confidence\":0..1,\"reason\":string}. intent=true only when the caller clearly reports an outage/emergency and expects a ticket to be opened (power/light/heating outage, no light, no power, авария, отключение света). intent=false for general questions, sales, wrong numbers, or ambiguous chat.",
          },
          { role: "user", content: text.slice(0, 8000) },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = j.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { intent?: boolean; confidence?: number; reason?: string };
    return {
      intent: !!parsed.intent,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const Route = createFileRoute("/api/public/hooks/post-call-verification")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data: calls } = await supabaseAdmin
          .from("calls")
          .select("id, owner_id, ended_at, transcript, external_call_ref, from_number")
          .not("ended_at", "is", null)
          .gte("ended_at", since)
          .limit(200);

        const flagged: Array<{ call_id: string; owner_id: string; reason: string; confidence: number }> = [];
        for (const c of calls ?? []) {
          const transcript = (Array.isArray(c.transcript) ? c.transcript : []) as unknown[];
          const text = transcript
            .map((m) => (m && typeof m === "object" && "text" in (m as Record<string, unknown>) && typeof (m as Record<string, unknown>).text === "string" ? String((m as Record<string, unknown>).text) : ""))
            .join(" ");
          if (!text.trim()) continue;

          // Cheap regex prefilter — no need to hit the LLM when nothing looks emergency-ish.
          const prefilter = REGEX_PREFILTER.test(text);
          if (!prefilter) continue;

          // LLM verification. If the LLM is unavailable, fall back to the prefilter result.
          const llm = await detectTicketIntentLLM(text);
          const intent = llm ? llm.intent : prefilter;
          const confidence = llm ? llm.confidence : 0.5;
          const reason = llm?.reason || "regex_prefilter_match";
          if (!intent || confidence < 0.6) continue;

          const { count } = await supabaseAdmin
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", c.owner_id)
            .in("status", ["success", "pending", "failed"])
            .or(`call_id.eq.${c.id},call_sid.eq.${c.external_call_ref ?? ""}`);
          if ((count ?? 0) > 0) continue;

          // Skip if we've already logged this call.
          const { count: already } = await supabaseAdmin
            .from("error_logs")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", c.owner_id)
            .eq("source", "post_call_verification")
            .eq("call_sid", c.id);
          if ((already ?? 0) > 0) continue;

          const { redactText, redactPhone } = await import("@/lib/pii");
          await supabaseAdmin.from("error_logs").insert({
            owner_id: c.owner_id,
            severity: "warn",
            source: "post_call_verification",
            call_sid: c.id,
            message: "Клиент упомянул аварию/заявку, но тикет не создан",
            context: {
              call_id: c.id,
              from_number: redactPhone(c.from_number),
              transcript_excerpt: redactText(text).slice(0, 500),
              llm_used: !!llm,
              confidence,
              reason,
            } as never,
          } as never);
          flagged.push({ call_id: c.id, owner_id: c.owner_id, reason, confidence });
        }
        return Response.json({ scanned: calls?.length ?? 0, flagged: flagged.length, results: flagged });
      },
    },
  },
});
