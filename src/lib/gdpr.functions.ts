import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// GDPR — Right to access (export) and right to erasure
// Operates on cloud-side data and (if self_hosted is enabled)
// forwards the same request to the client's on-prem gateway.
// ============================================================

export const exportMyDataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ context }): Promise<any> => {
    const { supabase, userId } = context;
    const t0 = Date.now();

    const [profile, agents, copilotAgents, calls, copilotSessions, copilotTranscript, knowledgeDocs, knowledgeChunks, whispers, complianceRules, residency, dsr] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("agents").select("*").eq("owner_id", userId),
      supabase.from("copilot_agents").select("*").eq("owner_id", userId),
      supabase.from("calls").select("*").eq("owner_id", userId).limit(5000),
      supabase.from("copilot_sessions").select("*").eq("owner_id", userId).limit(5000),
      supabase.from("copilot_transcript").select("*").eq("owner_id", userId).limit(20000),
      supabase.from("knowledge_documents").select("*").eq("owner_id", userId),
      supabase.from("knowledge_chunks").select("id,document_id,agent_id,chunk_index,content").eq("owner_id", userId).limit(50000),
      supabase.from("whispers").select("*").eq("owner_id", userId).limit(5000),
      supabase.from("compliance_rules").select("*").eq("owner_id", userId),
      supabase.from("data_residency_configs").select("mode,gateway_url,enabled,retention_days,sync_knowledge,sync_agents,sync_transcripts,gdpr_contact_email").eq("owner_id", userId).maybeSingle(),
      supabase.from("gdpr_dsr_requests").select("*").eq("owner_id", userId).order("created_at", { ascending: false }).limit(100),
    ]);

    const cloud = {
      profile: profile.data,
      agents: agents.data ?? [],
      copilot_agents: copilotAgents.data ?? [],
      calls: calls.data ?? [],
      copilot_sessions: copilotSessions.data ?? [],
      copilot_transcript: copilotTranscript.data ?? [],
      knowledge_documents: knowledgeDocs.data ?? [],
      knowledge_chunks: knowledgeChunks.data ?? [],
      whispers: whispers.data ?? [],
      compliance_rules: complianceRules.data ?? [],
      data_residency: residency.data,
      dsr_history: dsr.data ?? [],
    };

    let onprem: unknown = null;
    let onpremError: string | null = null;
    try {
      const { getResidencyConfig, callGateway, isSelfHosted } = await import("@/lib/data-residency.server");
      const cfg = await getResidencyConfig(userId);
      if (isSelfHosted(cfg)) {
        const r = await callGateway<{ data: unknown }>(cfg, "POST", "/gdpr/export", {}, { timeoutMs: 60000 });
        if (r.ok) onprem = r.data; else onpremError = r.error;
      }
    } catch (e) { onpremError = e instanceof Error ? e.message : String(e); }

    const counts = {
      profile: profile.data ? 1 : 0,
      agents: cloud.agents.length,
      copilot_agents: cloud.copilot_agents.length,
      calls: cloud.calls.length,
      copilot_sessions: cloud.copilot_sessions.length,
      copilot_transcript: cloud.copilot_transcript.length,
      knowledge_documents: cloud.knowledge_documents.length,
      knowledge_chunks: cloud.knowledge_chunks.length,
      whispers: cloud.whispers.length,
      compliance_rules: cloud.compliance_rules.length,
    };

    await supabase.from("gdpr_dsr_requests").insert({
      owner_id: userId,
      kind: "export",
      status: "done",
      scope: { cloud_counts: counts, onprem_included: !!onprem, onprem_error: onpremError },
      result: { ms: Date.now() - t0 },
      completed_at: new Date().toISOString(),
    });

    return {
      generated_at: new Date().toISOString(),
      owner_id: userId,
      counts,
      cloud,
      onprem,
      onprem_error: onpremError,
    };
  });

export const eraseMyDataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    confirm: z.literal("ERASE"),
    scope: z.array(z.enum(["calls","copilot","knowledge","agents","whispers"])).default(["calls","copilot","knowledge","agents","whispers"]),
    include_onprem: z.boolean().default(true),
  }).parse(d))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase, userId } = context;
    const t0 = Date.now();
    const deleted: Record<string, number | null> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const del = async (table: string) => {
      const { error, count } = await sb.from(table).delete({ count: "exact" }).eq("owner_id", userId);
      if (error) throw new Error(`${table}: ${error.message}`);
      return count ?? 0;
    };

    if (data.scope.includes("calls")) {
      deleted.call_analysis_events = await del("call_analysis_events");
      deleted.objection_events = await del("objection_events");
      deleted.calls = await del("calls");
    }
    if (data.scope.includes("copilot")) {
      deleted.copilot_suggestions = await del("copilot_suggestions");
      deleted.copilot_transcript = await del("copilot_transcript");
      deleted.copilot_sessions = await del("copilot_sessions");
    }
    if (data.scope.includes("knowledge")) {
      deleted.knowledge_chunks = await del("knowledge_chunks");
      // Also remove storage files
      const { data: docs } = await supabase.from("knowledge_documents").select("file_path").eq("owner_id", userId);
      const paths = (docs ?? []).map((d) => d.file_path).filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from("knowledge-files").remove(paths).catch(() => {});
      deleted.knowledge_documents = await del("knowledge_documents");
    }
    if (data.scope.includes("agents")) {
      deleted.copilot_agents = await del("copilot_agents");
      deleted.agents = await del("agents");
    }
    if (data.scope.includes("whispers")) {
      deleted.whispers = await del("whispers");
    }

    let onpremDeleted: unknown = null;
    let onpremError: string | null = null;
    if (data.include_onprem) {
      try {
        const { getResidencyConfig, callGateway, isSelfHosted } = await import("@/lib/data-residency.server");
        const cfg = await getResidencyConfig(userId);
        if (isSelfHosted(cfg)) {
          const r = await callGateway<{ deleted: Record<string, number> }>(cfg, "POST", "/gdpr/erase", { confirm: "ERASE" }, { timeoutMs: 120000 });
          if (r.ok) onpremDeleted = r.data.deleted; else onpremError = r.error;
        }
      } catch (e) { onpremError = e instanceof Error ? e.message : String(e); }
    }

    await supabase.from("gdpr_dsr_requests").insert({
      owner_id: userId,
      kind: "erase",
      status: onpremError ? "failed" : "done",
      scope: { scope: data.scope, include_onprem: data.include_onprem },
      result: { cloud: deleted, onprem: onpremDeleted, ms: Date.now() - t0 },
      error: onpremError,
      completed_at: new Date().toISOString(),
    });

    return { ok: !onpremError, cloud: deleted, onprem: onpremDeleted, onprem_error: onpremError };
  });

export const listMyDsrRequestsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("gdpr_dsr_requests")
      .select("id,kind,status,scope,result,error,created_at,completed_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

// ============================================================
// Sync — push current knowledge base + agents + recent transcripts
// to the client's on-prem gateway in one shot.
// ============================================================

export const syncToGatewayFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    include_knowledge: z.boolean().default(true),
    include_agents: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getResidencyConfig, callGateway, isSelfHosted } = await import("@/lib/data-residency.server");
    const cfg = await getResidencyConfig(userId);
    if (!isSelfHosted(cfg)) return { ok: false, error: "Gateway not configured" };

    const stats = { agents: 0, copilot_agents: 0, documents: 0, chunks: 0, errors: [] as string[] };

    if (data.include_agents) {
      const [{ data: ag }, { data: cag }] = await Promise.all([
        supabase.from("agents").select("*").eq("owner_id", userId),
        supabase.from("copilot_agents").select("*").eq("owner_id", userId),
      ]);
      for (const a of ag ?? []) {
        const r = await callGateway(cfg, "POST", "/agents/upsert", { id: a.id, name: a.name, kind: "voice", snapshot: a });
        if (r.ok) stats.agents++; else stats.errors.push(`agent ${a.id}: ${r.error}`);
      }
      for (const a of cag ?? []) {
        const r = await callGateway(cfg, "POST", "/agents/upsert", { id: a.id, name: a.name, kind: "copilot", snapshot: a });
        if (r.ok) stats.copilot_agents++; else stats.errors.push(`copilot_agent ${a.id}: ${r.error}`);
      }
    }

    if (data.include_knowledge) {
      const { data: docs } = await supabase.from("knowledge_documents").select("*").eq("owner_id", userId);
      for (const doc of docs ?? []) {
        const { data: chunks } = await supabase
          .from("knowledge_chunks")
          .select("id,chunk_index,content,embedding")
          .eq("document_id", doc.id)
          .order("chunk_index", { ascending: true });
        const body = {
          id: doc.id,
          agent_id: doc.agent_id,
          name: doc.file_name ?? doc.title ?? null,
          mime: doc.mime_type ?? null,
          bytes: doc.size_bytes ?? 0,
          meta: { status: doc.status },
          chunks: (chunks ?? []).map((c) => {
            // embedding may be string ("[0.1,0.2,...]") or array depending on supabase-js + pgvector
            let emb: number[] | null = null;
            if (Array.isArray(c.embedding)) emb = c.embedding as number[];
            else if (typeof c.embedding === "string") { try { emb = JSON.parse(c.embedding); } catch { emb = null; } }
            return { id: c.id, chunk_index: c.chunk_index, content: c.content, embedding: emb };
          }),
        };
        const r = await callGateway(cfg, "POST", "/knowledge/documents/upsert", body, { timeoutMs: 60000 });
        if (r.ok) { stats.documents++; stats.chunks += body.chunks.length; }
        else stats.errors.push(`doc ${doc.id}: ${r.error}`);
      }
    }

    await supabase.from("data_residency_configs").update({ last_full_sync_at: new Date().toISOString() }).eq("owner_id", userId);
    await supabase.from("gdpr_dsr_requests").insert({
      owner_id: userId, kind: "sync", status: stats.errors.length ? "failed" : "done",
      scope: data, result: { ...stats, errors: stats.errors.slice(0, 20) },
      error: stats.errors[0] ?? null, completed_at: new Date().toISOString(),
    });

    return { ok: stats.errors.length === 0, ...stats };
  });
