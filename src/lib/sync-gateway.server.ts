// Server-only helpers for pushing changes to the client's on-prem gateway.
// Safe to import only from *.server.ts or inside server-fn handlers (dynamic import).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getResidencyConfig, callGateway, isSelfHosted } from "@/lib/data-residency.server";

type SyncResult = { synced: boolean; reason?: string; error?: string };

/** Push a knowledge document + its chunks to the gateway. Best-effort, never throws. */
export async function syncDocumentToGateway(ownerId: string, documentId: string): Promise<SyncResult> {
  try {
    const cfg = await getResidencyConfig(ownerId);
    if (!isSelfHosted(cfg)) return { synced: false, reason: "not_self_hosted" };
    const { data: drc } = await supabaseAdmin
      .from("data_residency_configs")
      .select("sync_knowledge")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!drc?.sync_knowledge) return { synced: false, reason: "sync_knowledge_disabled" };

    const { data: doc } = await supabaseAdmin
      .from("knowledge_documents")
      .select("*")
      .eq("id", documentId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!doc) return { synced: false, reason: "doc_not_found" };

    const { data: chunks } = await supabaseAdmin
      .from("knowledge_chunks")
      .select("id,chunk_index,content,embedding")
      .eq("document_id", documentId)
      .order("chunk_index", { ascending: true });

    const body = {
      id: doc.id,
      agent_id: doc.agent_id,
      name: doc.file_name ?? null,
      mime: doc.mime_type ?? null,
      bytes: doc.size_bytes ?? 0,
      meta: { status: doc.status },
      chunks: (chunks ?? []).map((c) => {
        let emb: number[] | null = null;
        if (Array.isArray(c.embedding)) emb = c.embedding as unknown as number[];
        else if (typeof c.embedding === "string") { try { emb = JSON.parse(c.embedding); } catch { emb = null; } }
        return { id: c.id, chunk_index: c.chunk_index, content: c.content, embedding: emb };
      }),
    };
    const r = await callGateway(cfg, "POST", "/knowledge/documents/upsert", body, { timeoutMs: 60000 });
    return r.ok ? { synced: true } : { synced: false, error: r.error };
  } catch (e) {
    return { synced: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Push an agent snapshot ('voice' | 'copilot') to the gateway. Best-effort. */
export async function syncAgentToGateway(
  ownerId: string,
  agentId: string,
  kind: "voice" | "copilot",
): Promise<SyncResult> {
  try {
    const cfg = await getResidencyConfig(ownerId);
    if (!isSelfHosted(cfg)) return { synced: false, reason: "not_self_hosted" };
    const { data: drc } = await supabaseAdmin
      .from("data_residency_configs")
      .select("sync_agents")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!drc?.sync_agents) return { synced: false, reason: "sync_agents_disabled" };

    const table = kind === "copilot" ? "copilot_agents" : "agents";
    const { data: a } = await supabaseAdmin
      .from(table)
      .select("*")
      .eq("id", agentId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!a) return { synced: false, reason: "agent_not_found" };

    const r = await callGateway(cfg, "POST", "/agents/upsert", {
      id: a.id,
      name: a.name ?? null,
      kind,
      snapshot: a,
    });
    return r.ok ? { synced: true } : { synced: false, error: r.error };
  } catch (e) {
    return { synced: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fire-and-forget wrappers — never block the caller. */
export function syncDocumentToGatewayAsync(ownerId: string, documentId: string): void {
  void syncDocumentToGateway(ownerId, documentId).catch(() => {});
}
export function syncAgentToGatewayAsync(ownerId: string, agentId: string, kind: "voice" | "copilot"): void {
  void syncAgentToGateway(ownerId, agentId, kind).catch(() => {});
}
