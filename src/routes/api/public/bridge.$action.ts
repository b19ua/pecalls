// Public bridge API for on-premise asterisk-bridge (Docker on client server).
//
// Единый endpoint, чтобы мост не тащил напрямую SUPABASE_SERVICE_ROLE_KEY
// (клиент на Lovable Cloud его получить не может).
//
// AUTH: per-agent shared secret из agents.asterisk_webhook_secret.
//   Headers: X-Asterisk-Secret: <secret>, X-Agent-Id: <uuid>
// Все ответы, где секрет/агент не совпал → 401 (единообразно).
//
// Actions (POST /api/public/bridge/<action>):
//   - context            → полный ExtCtx для агента (без CRM2 hmac_secret)
//   - call-init          → { call_sid } → { agent_id, owner_id } + PATCH status=in_progress
//   - call-transcript    → { call_sid, transcript, status? } → PATCH calls
//   - call-finalize      → { call_sid, status, transcript?, summary?, input_tokens?, output_tokens? } → PATCH ended_at
//   - call-handoff       → { call_sid, handoff_to } → PATCH handoff_at/to/status
//   - objection          → { call_sid, ...event } → INSERT objection_events
//   - crm2               → { call_sid, args } → серверная подпись HMAC + прокси в CRM2 URL owner-а
//   - summary            → { call_sid, transcript } → Lovable AI summary + PATCH calls

import { createFileRoute } from "@tanstack/react-router";

function unauthorized() { return new Response("Unauthorized", { status: 401 }); }
function badRequest(msg: string) { return new Response(msg, { status: 400 }); }
function ok(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

// Circuit breaker for CRM2 per-owner (in-memory, best-effort — worker restart OK).
type Breaker = { fails: number; openUntil: number };
const crm2Breakers = new Map<string, Breaker>();
const PHONE_RE = /^\+?[0-9]{7,15}$/;
const NLC_RE = /^[0-9]{6,12}$/;

async function verifyAgent(request: Request): Promise<{ agentId: string; ownerId: string; secret: string } | null> {
  const supplied = (request.headers.get("x-asterisk-secret") || "").trim();
  const agentId = (request.headers.get("x-agent-id") || "").trim();
  if (!supplied || !agentId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("id, owner_id, asterisk_webhook_secret, telephony_provider")
    .eq("id", agentId)
    .maybeSingle();
  const expected = ((agent?.asterisk_webhook_secret as string | null) || "").trim();
  if (!expected || agent?.telephony_provider !== "asterisk") return null;
  if (!safeEqual(supplied, expected)) return null;
  return { agentId: agent!.id as string, ownerId: agent!.owner_id as string, secret: expected };
}

export const Route = createFileRoute("/api/public/bridge/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await verifyAgent(request);
        if (!auth) return unauthorized();

        let body: any = {};
        try { body = await request.json(); } catch { /* allow empty */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const action = params.action;

        // ---------------- context ----------------
        if (action === "context") {
          const { data: agent } = await supabaseAdmin
            .from("agents")
            .select("id, owner_id, system_prompt, voice, language, model, temperature, greeting, record_calls, handoff_enabled, handoff_dtmf_digit, handoff_numbers, objection_handling_enabled, objection_aaa_enabled, objection_categories, objection_custom_responses, emotion_tracking_enabled, tools_config, asterisk_ari_base_url, asterisk_ari_username, asterisk_ari_password")
            .eq("id", auth.agentId)
            .maybeSingle();
          if (!agent) return unauthorized();

          const { data: toolRows } = await supabaseAdmin
            .from("agent_tools")
            .select("id, type, name, description, enabled, config")
            .eq("agent_id", auth.agentId)
            .eq("owner_id", auth.ownerId)
            .eq("enabled", true);

          const { data: cfgRows } = await supabaseAdmin
            .from("data_residency_configs")
            .select("crm_enabled, crm_url, crm_auth_header, crm_auth_value, crm_timeout_ms, crm_tool_description, crm_object1_label, crm_object2_label, crm_object3_label, crm2_enabled, crm2_url, crm2_timeout_ms, crm2_system_prompt_template, hmac_secret")
            .eq("owner_id", auth.ownerId)
            .limit(1);
          const drc: any = cfgRows?.[0];

          // Knowledge (полный текст если ≤24k, иначе усечённый — без embedding, чтобы не растить latency).
          const { data: all } = await supabaseAdmin
            .from("knowledge_chunks")
            .select("content, chunk_index")
            .eq("agent_id", auth.agentId)
            .eq("owner_id", auth.ownerId)
            .order("chunk_index", { ascending: true })
            .limit(200);
          const allText = (all || []).map((r: any) => String(r.content || "").trim()).filter(Boolean).join("\n");
          const knowledgeContext = allText.length <= 24000 ? allText : allText.slice(0, 18000);

          const crmLite = drc?.crm_enabled && drc?.crm_url ? {
            enabled: true, description: drc.crm_tool_description || "Get caller info from local CRM by phone number.",
            object1: drc.crm_object1_label || "object_1", object2: drc.crm_object2_label || "object_2", object3: drc.crm_object3_label || "object_3",
          } : null;
          const crmFull = drc?.crm_enabled && drc?.crm_url ? {
            url: String(drc.crm_url), authHeader: drc.crm_auth_header || "", authValue: drc.crm_auth_value || "",
            timeoutMs: Number(drc.crm_timeout_ms ?? 2000),
            object1: drc.crm_object1_label || "object_1", object2: drc.crm_object2_label || "object_2", object3: drc.crm_object3_label || "object_3",
          } : null;
          const crm2Lite = drc?.crm2_enabled && drc?.crm2_url ? {
            enabled: true, systemPromptTemplate: String(drc.crm2_system_prompt_template || ""),
          } : null;
          // HMAC secret НЕ отдаём наружу — CRM2 вызовы проксируются через action=crm2.
          const crm2Configured = !!(drc?.crm2_enabled && drc?.crm2_url);

          return ok({
            agentId: agent.id,
            ownerId: agent.owner_id,
            systemPrompt: agent.system_prompt || "",
            knowledgeContext,
            language: agent.language || "ru-RU",
            greeting: agent.greeting || "Здравствуйте!",
            handoffEnabled: !!agent.handoff_enabled,
            handoffDigit: agent.handoff_dtmf_digit || "0",
            handoffNumbers: Array.isArray(agent.handoff_numbers) ? agent.handoff_numbers : [],
            tools: toolRows || [],
            objectionEnabled: !!agent.objection_handling_enabled,
            objectionAaaEnabled: agent.objection_aaa_enabled !== false,
            objectionCategories: Array.isArray(agent.objection_categories) ? agent.objection_categories : [],
            objectionCustomResponses: (agent.objection_custom_responses && typeof agent.objection_custom_responses === "object")
              ? agent.objection_custom_responses : {},
            emotionTrackingEnabled: agent.emotion_tracking_enabled !== false,
            crm: crmLite,
            crm2: crm2Lite,
            crm2Configured,
            toolsConfig: (agent.tools_config && typeof agent.tools_config === "object" && !Array.isArray(agent.tools_config))
              ? agent.tools_config : {},
            voice: agent.voice || "Aoede",
            model: agent.model || "gemini-2.0-flash-live-001",
            temperature: Number(agent.temperature ?? 0.6),
            recordCalls: !!agent.record_calls,
            crmFull,
            handoffAriBase: String(agent.asterisk_ari_base_url || "").replace(/\/+$/, ""),
            handoffAriAuth: agent.asterisk_ari_username && agent.asterisk_ari_password
              ? "Basic " + btoa(`${agent.asterisk_ari_username}:${agent.asterisk_ari_password}`)
              : "",
          });
        }

        // ---------------- call-init ----------------
        if (action === "call-init") {
          const callSid = String(body.call_sid || "").trim();
          if (!callSid) return badRequest("call_sid required");
          const fromNumber = String(body.from_number ?? body.caller_id ?? body.caller_number ?? "").trim() || null;
          const toNumber = String(body.to_number ?? body.called_number ?? "").trim() || null;
          const direction = body.direction === "outbound" ? "outbound" : "inbound";
          const { data: call } = await supabaseAdmin
            .from("calls")
            .select("id, agent_id, owner_id")
            .eq("twilio_call_sid", callSid)
            .maybeSingle();
          if (call) {
            // existing row (outbound flow — pre-inserted by placeAsteriskCall):
            // enforce strict ownership to prevent agent spoofing.
            if (call.agent_id !== auth.agentId || call.owner_id !== auth.ownerId) return unauthorized();
            const patch: Record<string, unknown> = { status: "in_progress", started_at: new Date().toISOString() };
            if (fromNumber) patch.from_number = fromNumber;
            if (toNumber) patch.to_number = toNumber;
            await supabaseAdmin
              .from("calls")
              .update(patch as never)
              .eq("twilio_call_sid", callSid);
          } else {
            // inbound flow: no row exists yet — create on the fly.
            // verifyAgent() already proved the caller owns this agent's webhook secret,
            // so it's safe to bind the new row to auth.agentId / auth.ownerId.
            const { error: insErr } = await supabaseAdmin
              .from("calls")
              .insert({
                owner_id: auth.ownerId,
                agent_id: auth.agentId,
                twilio_call_sid: callSid,
                status: "in_progress",
                direction,
                from_number: fromNumber,
                to_number: toNumber,
                started_at: new Date().toISOString(),
              } as never);
            if (insErr) return new Response(insErr.message, { status: 500 });
          }
          return ok({ agent_id: auth.agentId, owner_id: auth.ownerId });
        }


        // ---------------- call-transcript ----------------
        if (action === "call-transcript") {
          const callSid = String(body.call_sid || "").trim();
          if (!callSid) return badRequest("call_sid required");
          const transcript = Array.isArray(body.transcript) ? body.transcript.slice(-500) : [];
          const patch: Record<string, unknown> = { transcript, source: "ai" };
          if (body.status) patch.status = String(body.status);
          const { error } = await supabaseAdmin
            .from("calls")
            .update(patch as never)
            .eq("twilio_call_sid", callSid)
            .eq("owner_id", auth.ownerId);
          if (error) return new Response(error.message, { status: 500 });
          return ok({ ok: true });
        }

        // ---------------- call-finalize ----------------
        if (action === "call-finalize") {
          const callSid = String(body.call_sid || "").trim();
          if (!callSid) return badRequest("call_sid required");
          const patch: Record<string, unknown> = {
            status: String(body.status || "completed"),
            ended_at: new Date().toISOString(),
          };
          if (Array.isArray(body.transcript)) patch.transcript = body.transcript.slice(-500);
          if (typeof body.summary === "string") patch.summary = body.summary;
          if (typeof body.input_tokens === "number") patch.input_tokens = body.input_tokens;
          if (typeof body.output_tokens === "number") patch.output_tokens = body.output_tokens;
          await supabaseAdmin
            .from("calls")
            .update(patch as never)
            .eq("twilio_call_sid", callSid)
            .eq("owner_id", auth.ownerId);
          return ok({ ok: true });
        }

        // ---------------- call-handoff ----------------
        if (action === "call-handoff") {
          const callSid = String(body.call_sid || "").trim();
          const handoffTo = String(body.handoff_to || "").trim();
          if (!callSid) return badRequest("call_sid required");
          await supabaseAdmin
            .from("calls")
            .update({
              handoff_at: new Date().toISOString(),
              handoff_to: handoffTo || null,
              status: "handoff",
            } as never)
            .eq("twilio_call_sid", callSid)
            .eq("owner_id", auth.ownerId);
          return ok({ ok: true });
        }

        // ---------------- objection ----------------
        if (action === "objection") {
          const row = {
            owner_id: auth.ownerId,
            agent_id: auth.agentId,
            call_sid: body.call_sid ? String(body.call_sid) : null,
            channel: "voice",
            objection_type: String(body.objection_type || "unknown").slice(0, 50),
            raw_quote: body.raw_quote ? String(body.raw_quote).slice(0, 2000) : null,
            customer_emotion: body.customer_emotion ? String(body.customer_emotion).slice(0, 50) : null,
            strategy_used: body.strategy_used ? String(body.strategy_used).slice(0, 200) : null,
            ai_response: body.ai_response ? String(body.ai_response).slice(0, 2000) : null,
            outcome: String(body.outcome || "unresolved").slice(0, 30),
          };
          const { data, error } = await supabaseAdmin.from("objection_events").insert(row as never).select("id").maybeSingle();
          if (error) return new Response(error.message, { status: 500 });
          return ok({ ok: true, id: (data as any)?.id });
        }

        // ---------------- crm2 (server-side HMAC proxy) ----------------
        if (action === "crm2") {
          const callSid = String(body.call_sid || "").trim();
          const args = (body.args && typeof body.args === "object") ? body.args : {};

          const { data: cfgRows } = await supabaseAdmin
            .from("data_residency_configs")
            .select("crm2_enabled, crm2_url, crm2_timeout_ms, hmac_secret")
            .eq("owner_id", auth.ownerId)
            .limit(1);
          const drc: any = cfgRows?.[0];
          if (!drc?.crm2_enabled || !drc?.crm2_url) {
            return ok({ ok: false, error: "Система регистрации заявок временно недоступна", reason: "integration_disabled" });
          }

          const bkey = `crm2:${auth.ownerId}`;
          const bs = crm2Breakers.get(bkey) ?? { fails: 0, openUntil: 0 };
          if (bs.openUntil > Date.now()) {
            return ok({ ok: false, error: "Система регистрации заявок временно недоступна", reason: "breaker_open" });
          }

          const emergency_type = String(args.emergency_type ?? "").trim();
          const phone_number = String(args.phone_number ?? "").trim();
          const nlc_number = String(args.nlc_number ?? "").trim();
          const facility_address = String(args.facility_address ?? "").trim();
          const caller_comment = String(args.caller_comment ?? "").trim();
          const ALLOWED = new Set(["no_light_individual", "no_light_area", "wire_down_danger", "sparking_equipment"]);
          if (!ALLOWED.has(emergency_type)) return ok({ ok: false, error: "Некорректный тип аварии.", reason: "invalid_emergency_type" });
          if (!phone_number || !PHONE_RE.test(phone_number.replace(/[\s\-()]/g, ""))) return ok({ ok: false, error: "Некорректный номер телефона.", reason: "invalid_phone" });
          if (!nlc_number && !facility_address) return ok({ ok: false, error: "Нужен NLC или адрес.", reason: "missing_address_and_nlc" });
          if (nlc_number && !NLC_RE.test(nlc_number)) return ok({ ok: false, error: "Некорректный NLC.", reason: "invalid_nlc" });

          const idempotencyKey = `${callSid}:${emergency_type}:${nlc_number || facility_address}`;
          const bodyObj = { phone_number, nlc_number, facility_address, emergency_type, caller_comment, call_sid: callSid, idempotency_key: idempotencyKey };
          const bodyStr = JSON.stringify(bodyObj);
          const ts = Math.floor(Date.now() / 1000).toString();
          const headers: Record<string, string> = { "Content-Type": "application/json", "X-CRM-Timestamp": ts, "X-Idempotency-Key": idempotencyKey };
          if (drc.hmac_secret) {
            try {
              const enc = new TextEncoder();
              const key = await crypto.subtle.importKey("raw", enc.encode(String(drc.hmac_secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
              const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${bodyStr}`));
              headers["X-CRM-Signature"] = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
            } catch { /* skip signature */ }
          }
          const timeoutMs = Math.min(Math.max(Number(drc.crm2_timeout_ms ?? 3000), 1000), 10000);
          const t0 = Date.now();
          try {
            const ctl = new AbortController();
            const tid = setTimeout(() => ctl.abort(), timeoutMs);
            const r = await fetch(String(drc.crm2_url), { method: "POST", headers, body: bodyStr, signal: ctl.signal });
            clearTimeout(tid);
            const txt = (await r.text()).slice(0, 20000);
            let parsed: Record<string, unknown> = {};
            try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
            if (r.ok) {
              crm2Breakers.set(bkey, { fails: 0, openUntil: 0 });
              const externalId = (parsed as any).ticket_id ?? (parsed as any).id ?? null;
              return ok({ ok: true, latency_ms: Date.now() - t0, ticket_id: externalId, data: parsed });
            }
            const nextFails = bs.fails + 1;
            crm2Breakers.set(bkey, { fails: nextFails, openUntil: nextFails >= 5 ? Date.now() + 60_000 : 0 });
            return ok({ ok: false, error: "Система регистрации заявок временно недоступна", reason: `http_${r.status}` });
          } catch (e) {
            const nextFails = bs.fails + 1;
            crm2Breakers.set(bkey, { fails: nextFails, openUntil: nextFails >= 5 ? Date.now() + 60_000 : 0 });
            const msg = e instanceof Error ? e.message : String(e);
            return ok({ ok: false, error: "Система регистрации заявок временно недоступна", reason: msg.includes("abort") ? "timeout" : "network_error" });
          }
        }

        // ---------------- summary ----------------
        if (action === "summary") {
          const callSid = String(body.call_sid || "").trim();
          const transcript = Array.isArray(body.transcript) ? body.transcript : [];
          if (!callSid || transcript.length < 2) return ok({ ok: false, reason: "too_short" });
          const dialog = transcript.map((m: any) => `${m.role === "agent" || m.role === "model" ? "Agent" : "User"}: ${m.text}`).join("\n").slice(0, 8000);
          const sys = `You are a call analyst. Reply in the SAME language as the dialog below. Output: 1) what the call was about (1-2 sentences), 2) key facts (bullets), 3) caller intent, 4) next steps. No filler.`;
          const lovableKey = process.env.LOVABLE_API_KEY;
          try {
            let summary = "", inTok = 0, outTok = 0;
            if (lovableKey) {
              const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash",
                  messages: [{ role: "system", content: sys }, { role: "user", content: dialog }],
                }),
              });
              if (r.ok) {
                const j: any = await r.json();
                summary = j.choices?.[0]?.message?.content?.trim() || "";
                inTok = j.usage?.prompt_tokens || 0;
                outTok = j.usage?.completion_tokens || 0;
              }
            }
            if (summary) {
              await supabaseAdmin
                .from("calls")
                .update({ summary, input_tokens: inTok, output_tokens: outTok } as never)
                .eq("twilio_call_sid", callSid)
                .eq("owner_id", auth.ownerId);
            }
            return ok({ ok: true, summary });
          } catch (e) {
            return ok({ ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }

        return badRequest(`Unknown action: ${action}`);
      },
    },
  },
});
