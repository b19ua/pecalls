import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Upload, FileText, Loader2, Trash2, RefreshCw, AlertCircle, CheckCircle2, Lightbulb, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

async function triggerProcessing(documentId: string) {
  const { error } = await supabase.functions.invoke("process-knowledge", {
    body: { documentId },
  });
  if (error) throw new Error(error.message);
}

export const Route = createFileRoute("/_authenticated/knowledge")({
  component: KnowledgePage,
  validateSearch: (s: Record<string, unknown>) => ({ agent: typeof s.agent === "string" ? s.agent : undefined }),
});

type Agent = { id: string; name: string };
type Doc = {
  id: string;
  file_name: string;
  size_bytes: number;
  status: string;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
  agent_id: string;
};

const ACCEPT = ".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 50 * 1024 * 1024;

function KnowledgePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const search = useSearch({ from: "/_authenticated/knowledge" });
  const processFn = useServerFn(processDocument);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string>(search.agent ?? "");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("agents").select("id,name").order("created_at", { ascending: false }).then(({ data }) => {
      setAgents(data ?? []);
      if (data && data.length && !agentId) setAgentId(search.agent ?? data[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDocs(id: string) {
    const { data } = await supabase
      .from("knowledge_documents")
      .select("id,file_name,size_bytes,status,chunk_count,error_message,created_at,agent_id")
      .eq("agent_id", id)
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  }

  useEffect(() => { if (agentId) loadDocs(agentId); }, [agentId]);

  async function handleFile(file: File) {
    if (!user || !agentId) return;
    if (file.size > MAX_BYTES) {
      toast.error("> 50 MB");
      return;
    }
    setUploading(true);
    try {
      const path = `${user.id}/${agentId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("knowledge-files").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) throw upErr;

      const { data: doc, error: insErr } = await supabase
        .from("knowledge_documents")
        .insert({
          owner_id: user.id,
          agent_id: agentId,
          file_name: file.name,
          file_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          status: "uploaded",
        })
        .select()
        .single();
      if (insErr || !doc) throw insErr ?? new Error("insert failed");

      await loadDocs(agentId);
      toast.success("OK");
      try {
        await triggerProcessing(doc.id);
        toast.success("OK");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "err");
      }
      await loadDocs(agentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "err");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function reindex(doc: Doc) {
    setBusy(doc.id);
    try {
      await triggerProcessing(doc.id);
      toast.success("OK");
      await loadDocs(agentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "err");
    } finally {
      setBusy(null);
    }
  }

  async function remove(doc: Doc) {
    if (!confirm(`${t("common.delete")}: ${doc.file_name}?`)) return;
    setBusy(doc.id);
    await supabase.storage.from("knowledge-files").remove([
      (await supabase.from("knowledge_documents").select("file_path").eq("id", doc.id).single()).data?.file_path ?? "",
    ]);
    await supabase.from("knowledge_documents").delete().eq("id", doc.id);
    setBusy(null);
    await loadDocs(agentId);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      {search.agent && (
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link to="/agents/$agentId" params={{ agentId: search.agent }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> К агенту
          </Link>
        </Button>
      )}
      <PageHeader title={t("kb.title")} description={t("kb.subtitle")} />

      <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5 text-sm">
        <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <span className="text-muted-foreground">{t("kb.tip")}</span>
      </div>

      {agents.length === 0 ? (
        <Card className="bg-gradient-card border-dashed border-2">
          <CardContent className="py-16 text-center">
            <BookOpen className="h-10 w-10 text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">{t("kb.noAgents")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-gradient-card shadow-soft mb-5">
            <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row gap-3 md:items-end">
              <div className="flex-1">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">{t("kb.agent")}</label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <Button
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading || !agentId}
                  className="bg-gradient-primary shadow-elegant w-full md:w-auto"
                >
                  {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                  {t("kb.upload")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {docs.length === 0 ? (
              <Card className="bg-gradient-card border-dashed border-2">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  {t("kb.empty")}
                </CardContent>
              </Card>
            ) : docs.map((d) => (
              <Card key={d.id} className="bg-gradient-card shadow-soft">
                <CardContent className="p-4 flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm sm:text-base">{d.file_name}</div>
                    <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-2 sm:gap-3 mt-0.5">
                      <span>{(d.size_bytes / 1024).toFixed(0)} KB</span>
                      <span>{d.chunk_count} {t("kb.chunks")}</span>
                      <StatusBadge status={d.status} />
                    </div>
                    {d.error_message && (
                      <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {d.error_message}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" disabled={busy === d.id} onClick={() => reindex(d)}>
                    {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" disabled={busy === d.id} onClick={() => remove(d)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === "ready") return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> {t("kb.status.ready")}</Badge>;
  if (status === "processing") return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {t("kb.status.processing")}</Badge>;
  if (status === "failed") return <Badge variant="destructive">{t("kb.status.failed")}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
