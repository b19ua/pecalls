// Live call risk analyzer. Called by transcript-producing bridges with
// { call_id, kind: "call" | "copilot_session" }. Uses Gemini to compute
// supervisor-grade risk signals and upserts them on the call row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNALS = [
  "calm", "price_objection", "unhandled_objection", "frustration",
  "escalation", "cancellation_risk", "compliance_risk", "silence",
  "buying_signal", "ai_stuck", "handoff_needed",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { call_id, kind } = await req.json() as { call_id: string; kind: "call" | "copilot_session" };
    if (!call_id || !["call", "copilot_session"].includes(kind)) {
      return json({ error: "bad input" }, 400);
    }

    // Load row + debounce
    const table = kind === "call" ? "calls" : "copilot_sessions";
    const { data: row, error: rowErr } = await supa.from(table)
      .select("id, owner_id, source, started_at, ended_at, risk_updated_at, agent_id")
      .eq("id", call_id).maybeSingle();
    if (rowErr || !row) return json({ error: "not found" }, 404);
    if (row.ended_at) return json({ skipped: "ended" });
    if (row.risk_updated_at) {
      const age = Date.now() - new Date(row.risk_updated_at).getTime();
      if (age < 6000) return json({ skipped: "debounce", age });
    }

    // Pull transcript
    let dialog = "";
    if (kind === "call") {
      const { data: c } = await supa.from("calls").select("transcript").eq("id", call_id).maybeSingle();
      const arr = (c?.transcript as Array<{ role: string; text: string; ts?: string }> | null) ?? [];
      const tail = arr.slice(-12);
      dialog = tail.map((m) => `${(m.role || "?").toUpperCase()}: ${m.text}`).join("\n");
    } else {
      const { data: rows } = await supa.from("copilot_transcript")
        .select("speaker, text, ts").eq("session_id", call_id)
        .order("ts", { ascending: false }).limit(12);
      const tail = (rows ?? []).reverse();
      dialog = tail.map((r) => `${r.speaker.toUpperCase()}: ${r.text}`).join("\n");
    }
    if (!dialog.trim()) return json({ skipped: "empty" });

    const source = row.source || (kind === "call" ? "ai" : "human");
    const system = [
      "You are a supervisor-grade real-time risk analyst for live phone calls.",
      "Output ONLY a single JSON object — no prose, no markdown.",
      "Schema: { risk_level: 'green'|'amber'|'red', risk_score: int 0-100, risk_reason: string (max ~12 words, in same language as the dialog), primary_signal: one of [" + SIGNALS.map((s) => `'${s}'`).join(",") + "], suggested_action: short string, sentiment: 'positive'|'neutral'|'negative' }.",
      "Rules:",
      "- Force risk_level='red' (score>=80) if customer mentions cancelling, complaint, legal threat, asks for a manager, compliance / GDPR / refund-demand.",
      "- amber for repeated unhandled objections, rising frustration, long silences.",
      source === "ai"
        ? "- Source is an autonomous AI agent. Watch for the bot looping, missing the intent, or the customer getting frustrated with the bot → set primary_signal='handoff_needed' and risk_level='red'."
        : "- Source is a human manager with copilot. Focus on the customer's emotional trajectory and unhandled objections.",
      "- risk_reason must be a short SUPERVISOR WARNING (e.g. 'Клиент угрожает отменить контракт', 'Bot stuck in loop, take over').",
    ].join("\n");

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Source: ${source}\nLast turns:\n${dialog}\n\nReturn JSON only.` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!ai.ok) {
      const t = await ai.text();
      console.error("ai error", ai.status, t);
      return json({ error: "ai failed", status: ai.status }, 502);
    }
    const j = await ai.json();
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    let risk_level = String(parsed.risk_level || "green");
    if (!["green", "amber", "red"].includes(risk_level)) risk_level = "green";
    let risk_score = Math.max(0, Math.min(100, Number(parsed.risk_score ?? 0) | 0));
    if (risk_level === "red" && risk_score < 80) risk_score = 80;
    if (risk_level === "amber" && risk_score < 40) risk_score = 50;
    if (risk_level === "green" && risk_score > 30) risk_score = 20;
    const risk_reason = (parsed.risk_reason ? String(parsed.risk_reason) : null)?.slice(0, 160) ?? null;
    let primary_signal = String(parsed.primary_signal || "calm");
    if (!SIGNALS.includes(primary_signal)) primary_signal = "calm";
    const suggested_action = parsed.suggested_action ? String(parsed.suggested_action).slice(0, 240) : null;
    const sentiment = ["positive", "neutral", "negative"].includes(String(parsed.sentiment))
      ? String(parsed.sentiment) : null;

    const patch: Record<string, unknown> = {
      risk_level, risk_score, risk_reason, primary_signal, suggested_action,
      risk_updated_at: new Date().toISOString(),
    };
    if (sentiment) patch.sentiment = sentiment;

    await supa.from(table).update(patch).eq("id", call_id);
    await supa.from("call_analysis_events").insert({
      owner_id: row.owner_id,
      call_id, call_kind: kind,
      risk_level, risk_score, risk_reason, primary_signal, suggested_action,
      signals: { sentiment, model: "gemini-2.5-flash" },
    });

    return json({ ok: true, risk_level, risk_score, primary_signal });
  } catch (e) {
    console.error("analyze-live-call", e);
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
