import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type TItem = { role?: string; source?: string; text?: string };

function transcriptToText(t: unknown): string {
  if (!Array.isArray(t)) return "";
  return (t as TItem[])
    .map((i) => {
      const role = (i.role ?? i.source ?? "").toLowerCase();
      const who = role === "agent" || role === "assistant" ? "AGENT" : role === "system" ? "SYSTEM" : "CALLER";
      return `${who}: ${(i.text ?? "").trim()}`;
    })
    .filter((l) => l.endsWith(":") === false)
    .join("\n");
}

const Out = z.object({
  sentiment: z.enum(["positive", "neutral", "negative"]),
  sentiment_score: z.number().min(-1).max(1),
  complaint_flag: z.boolean(),
  competitor_mentioned: z.boolean(),
  competitor_names: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  short_summary: z.string().max(500).optional().default(""),
});

async function analyzeOnce(text: string, summary: string | null): Promise<z.infer<typeof Out>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const sys = "You are a call-center quality analyst. Read the call transcript and return STRICT JSON, no commentary. Detect caller sentiment, complaint risk, competitor mentions and main topics. Languages: ru/ro/en mixed. Keys: sentiment (positive|neutral|negative), sentiment_score (-1..1), complaint_flag (bool), competitor_mentioned (bool), competitor_names (string[]), topics (string[] up to 5 short), short_summary (≤2 sentences in the call's language). Return ONLY the JSON object.";
  const userText = `Summary so far: ${summary ?? "(none)"}\n\nTranscript:\n${text.slice(0, 12000)}\n\nReturn JSON only.`;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    },
  );
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Gemini ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  const content: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}";
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { parsed = {}; }
  return Out.parse(parsed);
}

export const analyzeCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { callId: string }) => z.object({ callId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: call, error } = await supabase
      .from("calls")
      .select("id, owner_id, transcript, summary")
      .eq("id", data.callId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!call || call.owner_id !== userId) throw new Error("Not found");
    const text = transcriptToText(call.transcript);
    if (!text.trim()) return { ok: false as const, error: "Transcript is empty" };

    const a = await analyzeOnce(text, call.summary);
    const { error: uerr } = await supabase.from("calls").update({
      sentiment: a.sentiment,
      sentiment_score: a.sentiment_score,
      complaint_flag: a.complaint_flag,
      competitor_mentioned: a.competitor_mentioned,
      competitor_names: a.competitor_names,
      topics: a.topics,
      analyzed_at: new Date().toISOString(),
      ...(!call.summary && a.short_summary ? { summary: a.short_summary } : {}),
    }).eq("id", call.id);
    if (uerr) throw new Error(uerr.message);
    return { ok: true as const, analysis: a };
  });

export const analyzePendingCallsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: list } = await supabase
      .from("calls")
      .select("id")
      .eq("owner_id", userId)
      .is("analyzed_at", null)
      .neq("transcript", "[]")
      .order("created_at", { ascending: false })
      .limit(20);
    let ok = 0, fail = 0;
    for (const row of list ?? []) {
      try {
        const { data: c } = await supabase.from("calls").select("id, owner_id, transcript, summary").eq("id", row.id).maybeSingle();
        if (!c) continue;
        const text = transcriptToText(c.transcript);
        if (!text.trim()) continue;
        const a = await analyzeOnce(text, c.summary);
        await supabase.from("calls").update({
          sentiment: a.sentiment,
          sentiment_score: a.sentiment_score,
          complaint_flag: a.complaint_flag,
          competitor_mentioned: a.competitor_mentioned,
          competitor_names: a.competitor_names,
          topics: a.topics,
          analyzed_at: new Date().toISOString(),
          ...(c.summary ? {} : a.short_summary ? { summary: a.short_summary } : {}),
        }).eq("id", c.id);
        ok++;
      } catch (e) {
        fail++;
        console.error("[analyze] failed", row.id, e);
      }
    }
    return { ok, fail, processed: (list ?? []).length };
  });
