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

    // Pull transcript (keep speaker role; agent vs customer matters for compliance)
    let dialog = "";
    if (kind === "call") {
      const { data: c } = await supa.from("calls").select("transcript").eq("id", call_id).maybeSingle();
      const arr = (c?.transcript as Array<{ role: string; text: string; ts?: string }> | null) ?? [];
      const tail = arr.slice(-16);
      dialog = tail.map((m) => `${(m.role || "?").toUpperCase()}: ${m.text}`).join("\n");
    } else {
      const { data: rows } = await supa.from("copilot_transcript")
        .select("speaker, text, ts").eq("session_id", call_id)
        .order("ts", { ascending: false }).limit(16);
      const tail = (rows ?? []).reverse();
      dialog = tail.map((r) => `${r.speaker.toUpperCase()}: ${r.text}`).join("\n");
    }
    if (!dialog.trim()) return json({ skipped: "empty" });

    // Load active compliance rules for this owner
    const { data: ruleRows } = await supa.from("compliance_rules")
      .select("id, kind, text, correction, trigger_phrases")
      .eq("owner_id", row.owner_id).eq("active", true);
    const rules = (ruleRows ?? []) as Array<{
      id: string; kind: "must_say" | "must_not_say"; text: string;
      correction: string | null; trigger_phrases: string[] | null;
    }>;
    const mustSay = rules.filter((r) => r.kind === "must_say");
    const mustNotSay = rules.filter((r) => r.kind === "must_not_say");

    const source = row.source || (kind === "call" ? "ai" : "human");
    // The AGENT speaker in transcripts is the role most likely to be the
    // company representative. For AI calls that's "assistant"/"agent"; for
    // copilot it's "agent". Customer is "user"/"customer"/"caller".
    const agentSpeakerHint = kind === "call"
      ? "AGENT track = lines tagged ASSISTANT or AGENT. CUSTOMER track = lines tagged USER or CUSTOMER."
      : "AGENT track = lines tagged AGENT. CUSTOMER track = lines tagged CUSTOMER.";

    const complianceBlock = rules.length === 0 ? "" : [
      "",
      "COMPLIANCE RULES (apply ONLY to the AGENT's lines):",
      ...mustNotSay.map((r) => `- MUST_NOT_SAY [${r.id}]: ${r.text}${r.correction ? ` | compliant rephrase: ${r.correction}` : ""}`),
      ...mustSay.map((r) => `- MUST_SAY [${r.id}]: ${r.text}${r.correction ? ` | required line: ${r.correction}` : ""}`),
      agentSpeakerHint,
      "Detect must_not_say violations only when the AGENT (not customer) actually said something matching the rule's meaning in the visible window.",
      "Detect missing_required by checking whether the AGENT has satisfied each must_say rule ANYWHERE in the call so far (assume the visible window is the tail; if uncertain, mark as missing).",
    ].join("\n");

    const system = [
      "You are a supervisor-grade real-time risk analyst for live phone calls.",
      "Output ONLY a single JSON object — no prose, no markdown.",
      "Schema: { risk_level: 'green'|'amber'|'red', risk_score: int 0-100, risk_reason: string (max ~14 words, in same language as the dialog), primary_signal: one of [" + SIGNALS.map((s) => `'${s}'`).join(",") + "], suggested_action: short string, sentiment: 'positive'|'neutral'|'negative', compliance_violations: [{rule_id, rule_text, correction}], missing_required: [{rule_id, rule_text}], closing_signal: boolean }.",
      "Rules:",
      "- Force risk_level='red' (score>=80) if customer mentions cancelling, complaint, legal threat, asks for a manager, compliance / GDPR / refund-demand.",
      "- amber for repeated unhandled objections, rising frustration, long silences.",
      source === "ai"
        ? "- Source is an autonomous AI agent. Watch for the bot looping, missing the intent, or the customer getting frustrated with the bot → set primary_signal='handoff_needed' and risk_level='red'."
        : "- Source is a human manager with copilot. Focus on the customer's emotional trajectory and unhandled objections.",
      "- risk_reason must be a short SUPERVISOR WARNING (e.g. 'Клиент угрожает отменить контракт', 'Bot stuck in loop, take over').",
      "- If compliance_violations is non-empty → primary_signal='compliance_risk', risk_level at least 'amber' (red if customer risk is also high), risk_reason = 'Compliance: <first violation rule_text>. Say instead: <correction>'.",
      "- closing_signal = true only when the call shows a commitment / closing moment (price agreed, schedule set, payment, signup, contract).",
      "- compliance_violations and missing_required must reference rule_id verbatim from the rules list. If no rules supplied, return [] for both.",
      complianceBlock,
    ].filter(Boolean).join("\n");

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
    let risk_reason = (parsed.risk_reason ? String(parsed.risk_reason) : null)?.slice(0, 200) ?? null;
    let primary_signal = String(parsed.primary_signal || "calm");
    if (!SIGNALS.includes(primary_signal)) primary_signal = "calm";
    const suggested_action = parsed.suggested_action ? String(parsed.suggested_action).slice(0, 240) : null;
    const sentiment = ["positive", "neutral", "negative"].includes(String(parsed.sentiment))
      ? String(parsed.sentiment) : null;

    // Sanitize compliance arrays against the known rule set
    const ruleById = new Map(rules.map((r) => [r.id, r]));
    const rawViol = Array.isArray(parsed.compliance_violations) ? parsed.compliance_violations as Array<Record<string, unknown>> : [];
    const compliance_violations = rawViol
      .map((v) => {
        const id = String(v.rule_id ?? "");
        const r = ruleById.get(id);
        if (!r || r.kind !== "must_not_say") return null;
        return { rule_id: id, rule_text: r.text, correction: r.correction ?? null };
      })
      .filter(Boolean) as Array<{ rule_id: string; rule_text: string; correction: string | null }>;

    const rawMiss = Array.isArray(parsed.missing_required) ? parsed.missing_required as Array<Record<string, unknown>> : [];
    const missing_required = rawMiss
      .map((v) => {
        const id = String(v.rule_id ?? "");
        const r = ruleById.get(id);
        if (!r || r.kind !== "must_say") return null;
        return { rule_id: id, rule_text: r.text };
      })
      .filter(Boolean) as Array<{ rule_id: string; rule_text: string }>;

    const closing_signal = Boolean(parsed.closing_signal);

    // Compliance override: violations bump severity + override signal + reason
    if (compliance_violations.length > 0) {
      primary_signal = "compliance_risk";
      if (risk_level === "green") { risk_level = "amber"; risk_score = Math.max(risk_score, 55); }
      const v0 = compliance_violations[0];
      const corr = v0.correction ? `. Say instead: ${v0.correction}` : "";
      risk_reason = `Compliance: ${v0.rule_text}${corr}`.slice(0, 240);
    } else if (missing_required.length > 0 && closing_signal) {
      // Surface missing required at the closing moment without overriding
      // an existing red/amber warning unless we're still green.
      if (risk_level === "green") { risk_level = "amber"; risk_score = Math.max(risk_score, 45); }
      const m0 = missing_required[0];
      const extra = `Missing: ${m0.rule_text}`;
      risk_reason = risk_reason ? `${risk_reason} · ${extra}`.slice(0, 240) : extra.slice(0, 240);
    }

    // Clamp scores to band
    if (risk_level === "red" && risk_score < 80) risk_score = 80;
    if (risk_level === "amber" && risk_score < 40) risk_score = 50;
    if (risk_level === "green" && risk_score > 30) risk_score = 20;

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
      signals: {
        sentiment,
        model: "gemini-2.5-flash",
        compliance_violations,
        missing_required,
        closing_signal,
      },
    });

    return json({ ok: true, risk_level, risk_score, primary_signal, compliance_violations, missing_required });

  } catch (e) {
    console.error("analyze-live-call", e);
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
