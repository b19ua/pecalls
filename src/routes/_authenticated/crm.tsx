import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Trash2, Ban, Check } from "lucide-react";
import { listApiKeys, createApiKey, revokeApiKey, deleteApiKey } from "@/lib/api-keys.functions";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CrmPage,
});

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  agent_id: string | null;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type Agent = { id: string; name: string };

function CrmPage() {
  const { t } = useI18n();
  const list = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const remove = useServerFn(deleteApiKey);

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState<string>("all");
  const [justCreated, setJustCreated] = useState<{ key: ApiKey; plaintext: string } | null>(null);

  const refresh = async () => {
    const res = await list();
    setKeys(res.keys as ApiKey[]);
  };

  useEffect(() => {
    (async () => {
      await refresh();
      const { data } = await supabase.from("agents").select("id, name").order("name");
      setAgents((data as Agent[]) ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const onCreate = async () => {
    if (!name.trim()) {
      toast.error(t("crm.err.name"));
      return;
    }
    setCreating(true);
    try {
      const res = await create({ data: { name: name.trim(), agentId: agentId === "all" ? null : agentId } });
      setJustCreated(res as { key: ApiKey; plaintext: string });
      setName("");
      setAgentId("all");
      await refresh();
      toast.success(t("crm.created"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("crm.copied"));
  };

  const onRevoke = async (id: string) => {
    await revoke({ data: { id } });
    await refresh();
    toast.success(t("crm.revoked"));
  };

  const onDelete = async (id: string) => {
    if (!confirm(t("crm.deleteConfirm"))) return;
    await remove({ data: { id } });
    await refresh();
  };

  const agentName = (id: string | null) =>
    id ? agents.find((a) => a.id === id)?.name ?? "—" : t("crm.allAgents");

  const sampleCurl = `curl -H "Authorization: Bearer YOUR_KEY" \\\n  "${baseUrl}/api/public/crm/calls?limit=50"`;

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <PageHeader
        title={t("crm.title")}
        description={t("crm.subtitle")}
      />

      {/* Create */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" /> {t("crm.create.title")}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr,1fr,auto]">
            <div className="space-y-1.5">
              <Label>{t("crm.keyName")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="HubSpot integration" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("crm.scope")}</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("crm.allAgents")}</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={onCreate} disabled={creating} className="w-full md:w-auto">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("crm.generate")}
              </Button>
            </div>
          </div>

          {justCreated && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
              <div className="text-sm font-medium">{t("crm.savedOnce")}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background border rounded px-2 py-1.5 break-all">{justCreated.plaintext}</code>
                <Button size="sm" variant="outline" onClick={() => copy(justCreated.plaintext)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setJustCreated(null)}>
                <Check className="h-4 w-4 mr-1" /> {t("crm.ackSaved")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-medium">{t("crm.keys")}</div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}</div>
          ) : keys.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("crm.empty")}</div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{k.name}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                      <span>{k.prefix}…</span>
                      <span>{agentName(k.agent_id)}</span>
                      <span>{t("crm.lastUsed")}: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}</span>
                    </div>
                  </div>
                  {k.revoked_at ? (
                    <Badge variant="destructive">{t("crm.revokedTag")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("common.active")}</Badge>
                  )}
                  {!k.revoked_at && (
                    <Button size="sm" variant="outline" onClick={() => onRevoke(k.id)}>
                      <Ban className="h-4 w-4 mr-1" /> {t("crm.revoke")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onDelete(k.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Docs */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="text-sm font-medium">{t("crm.docs.title")}</div>
          <p className="text-sm text-muted-foreground">{t("crm.docs.intro")}</p>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">{t("crm.endpoint")}</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 break-all">GET {baseUrl}/api/public/crm/calls</code>
              <Button size="sm" variant="outline" onClick={() => copy(`${baseUrl}/api/public/crm/calls`)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">{t("crm.params")}</Label>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              <li><code>limit</code> — 1..200 (default 50)</li>
              <li><code>offset</code> — pagination offset</li>
              <li><code>since</code> — ISO timestamp, e.g. <code>2026-01-01T00:00:00Z</code></li>
              <li><code>phone</code> — substring match on from/to</li>
              <li><code>id</code> — specific call UUID</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">cURL</Label>
            <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap">{sampleCurl}</pre>
            <Button size="sm" variant="outline" onClick={() => copy(sampleCurl)}>
              <Copy className="h-4 w-4 mr-1" /> {t("crm.copyCurl")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t("crm.security")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
