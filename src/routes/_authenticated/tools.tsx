import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listTools, saveTool, deleteTool, listAgentsForTools } from "@/lib/tools.functions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Loader2, Wrench, Webhook, Database } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tools")({
  component: ToolsPage,
});

type ToolType = "webhook" | "crm_lookup" | "crm_write";
type Param = { name: string; type: "string" | "number" | "boolean"; description: string; required: boolean };

type ToolRow = {
  id: string;
  agent_id: string;
  type: ToolType;
  name: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

const TYPE_LABEL: Record<ToolType, string> = {
  webhook: "Webhook (мой API)",
  crm_lookup: "CRM — поиск контакта",
  crm_write: "CRM — создать запись",
};

const TYPE_ICON: Record<ToolType, typeof Wrench> = {
  webhook: Webhook,
  crm_lookup: Database,
  crm_write: Database,
};

function emptyConfig(type: ToolType) {
  if (type === "webhook") {
    return {
      url: "",
      method: "POST",
      auth_header_name: "",
      auth_header_value: "",
      parameters: [] as Param[],
      timeout_ms: 8000,
      response_hint: "",
    };
  }
  return {
    provider: "custom",
    base_url: "",
    path: "",
    method: type === "crm_lookup" ? "GET" : "POST",
    auth_header_name: "Authorization",
    auth_header_value: "",
    parameters: [] as Param[],
    body_template: "",
    timeout_ms: 8000,
    response_hint: "",
  };
}

function ToolsPage() {
  const listFn = useServerFn(listTools);
  const saveFn = useServerFn(saveTool);
  const delFn = useServerFn(deleteTool);
  const listAgentsFn = useServerFn(listAgentsForTools);

  const [tools, setTools] = useState<ToolRow[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ToolRow | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, a] = await Promise.all([listFn({ data: {} }), listAgentsFn()]);
      setTools(t.tools as ToolRow[]);
      setAgents(a.agents);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => (agentFilter === "all" ? tools : tools.filter((t) => t.agent_id === agentFilter)),
    [tools, agentFilter],
  );

  const startCreate = () => {
    const firstAgent = agents[0]?.id;
    if (!firstAgent) {
      toast.error("Сначала создайте агента");
      return;
    }
    setEditing({
      id: "",
      agent_id: agentFilter !== "all" ? agentFilter : firstAgent,
      type: "webhook",
      name: "",
      description: "",
      enabled: true,
      config: emptyConfig("webhook"),
    });
    setOpen(true);
  };

  const startEdit = (t: ToolRow) => {
    setEditing(JSON.parse(JSON.stringify(t)));
    setOpen(true);
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить инструмент?")) return;
    try {
      await delFn({ data: { id } });
      toast.success("Удалено");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Инструменты"
        description="Webhook и CRM-интеграции, которые ассистент использует во время разговора"
        actions={
          <Button onClick={startCreate} className="bg-gradient-primary shadow-elegant">
            <Plus className="h-4 w-4 mr-1.5" /> Новый инструмент
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <Label className="text-sm">Агент:</Label>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все агенты</SelectItem>
            {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-gradient-card shadow-soft">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Пока нет инструментов. Добавьте первый — агент сможет дёргать ваш API,
            искать клиента в CRM или создавать заявки.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t) => {
            const Icon = TYPE_ICON[t.type];
            const agent = agents.find((a) => a.id === t.agent_id);
            return (
              <Card key={t.id} className="bg-gradient-card shadow-soft">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{t.name}</h3>
                      <Badge variant="secondary">{TYPE_LABEL[t.type]}</Badge>
                      {agent && <Badge variant="outline">{agent.name}</Badge>}
                      {!t.enabled && <Badge variant="destructive">Выкл.</Badge>}
                    </div>
                    {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                      {String((t.config as { url?: string; base_url?: string; path?: string }).url
                        ?? `${(t.config as { base_url?: string }).base_url ?? ""}${(t.config as { path?: string }).path ?? ""}`)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ToolEditor
        tool={editing}
        agents={agents}
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        onSave={async (t) => {
          try {
            await saveFn({
              data: {
                id: t.id || null,
                data: {
                  agent_id: t.agent_id,
                  type: t.type,
                  name: t.name,
                  description: t.description,
                  enabled: t.enabled,
                  config: t.config,
                },
              },
            });
            toast.success("Сохранено");
            setOpen(false);
            setEditing(null);
            void load();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Ошибка");
          }
        }}
      />
    </div>
  );
}

function ToolEditor({
  tool, agents, open, onOpenChange, onSave,
}: {
  tool: ToolRow | null;
  agents: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (t: ToolRow) => Promise<void>;
}) {
  const [t, setT] = useState<ToolRow | null>(tool);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setT(tool); }, [tool]);

  if (!t) return null;
  const cfg = t.config as Record<string, unknown>;
  const setCfg = (patch: Record<string, unknown>) => setT({ ...t, config: { ...cfg, ...patch } });
  const params = (cfg.parameters as Param[]) ?? [];
  const setParams = (p: Param[]) => setCfg({ parameters: p });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.id ? "Редактировать инструмент" : "Новый инструмент"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Агент</Label>
              <Select value={t.agent_id} onValueChange={(v) => setT({ ...t, agent_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select
                value={t.type}
                onValueChange={(v) => {
                  const newType = v as ToolType;
                  setT({ ...t, type: newType, config: emptyConfig(newType) });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="webhook">Webhook (мой API)</SelectItem>
                  <SelectItem value="crm_lookup">CRM — поиск (по номеру и т.д.)</SelectItem>
                  <SelectItem value="crm_write">CRM — создать лид/тикет</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Имя функции (латиницей, без пробелов)</Label>
            <Input
              value={t.name}
              onChange={(e) => setT({ ...t, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
              placeholder="get_order_status"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Описание для ИИ — когда вызывать</Label>
            <Textarea
              rows={2}
              value={t.description}
              onChange={(e) => setT({ ...t, description: e.target.value })}
              placeholder="Получить статус заказа по номеру. Используй когда клиент спрашивает 'где мой заказ'."
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Включено</Label>
            <Switch checked={t.enabled} onCheckedChange={(v) => setT({ ...t, enabled: v })} />
          </div>

          <Separator />

          {t.type === "webhook" ? (
            <>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div className="space-y-1.5">
                  <Label>URL</Label>
                  <Input value={String(cfg.url ?? "")} onChange={(e) => setCfg({ url: e.target.value })} placeholder="https://api.example.com/orders" />
                </div>
                <div className="space-y-1.5">
                  <Label>Метод</Label>
                  <Select value={String(cfg.method ?? "POST")} onValueChange={(v) => setCfg({ method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["GET","POST","PUT","PATCH","DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Провайдер CRM</Label>
                <Select value={String(cfg.provider ?? "custom")} onValueChange={(v) => setCfg({ provider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hubspot">HubSpot</SelectItem>
                    <SelectItem value="salesforce">Salesforce</SelectItem>
                    <SelectItem value="bitrix24">Bitrix24</SelectItem>
                    <SelectItem value="custom">Custom HTTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Base URL</Label>
                <Input value={String(cfg.base_url ?? "")} onChange={(e) => setCfg({ base_url: e.target.value })} placeholder="https://api.hubapi.com" />
              </div>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div className="space-y-1.5">
                  <Label>Path (можно {`{параметр}`})</Label>
                  <Input value={String(cfg.path ?? "")} onChange={(e) => setCfg({ path: e.target.value })} placeholder="/crm/v3/objects/contacts/search" />
                </div>
                <div className="space-y-1.5">
                  <Label>Метод</Label>
                  <Select value={String(cfg.method ?? "GET")} onValueChange={(v) => setCfg({ method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["GET","POST","PUT","PATCH"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {t.type === "crm_write" && (
                <div className="space-y-1.5">
                  <Label>Тело запроса (JSON, {`{параметры}`} подставятся)</Label>
                  <Textarea
                    rows={4}
                    className="font-mono text-xs"
                    value={String(cfg.body_template ?? "")}
                    onChange={(e) => setCfg({ body_template: e.target.value })}
                    placeholder={`{\n  "properties": { "phone": "{phone}", "firstname": "{name}" }\n}`}
                  />
                </div>
              )}
            </>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Auth Header (имя)</Label>
              <Input value={String(cfg.auth_header_name ?? "")} onChange={(e) => setCfg({ auth_header_name: e.target.value })} placeholder="Authorization" />
            </div>
            <div className="space-y-1.5">
              <Label>Auth Header (значение)</Label>
              <Input type="password" value={String(cfg.auth_header_value ?? "")} onChange={(e) => setCfg({ auth_header_value: e.target.value })} placeholder="Bearer ..." />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Параметры, которые ИИ должен собрать</Label>
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => setParams([...params, { name: "", type: "string", description: "", required: true }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Добавить
              </Button>
            </div>
            {params.length === 0 && (
              <p className="text-xs text-muted-foreground">Например: phone, order_id, email...</p>
            )}
            {params.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2 items-start border rounded-md p-2">
                <div className="space-y-1">
                  <Input
                    placeholder="имя (phone)"
                    value={p.name}
                    onChange={(e) => {
                      const np = [...params];
                      np[i] = { ...p, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") };
                      setParams(np);
                    }}
                  />
                  <Input
                    placeholder="описание для ИИ"
                    value={p.description}
                    onChange={(e) => {
                      const np = [...params]; np[i] = { ...p, description: e.target.value }; setParams(np);
                    }}
                  />
                </div>
                <Select
                  value={p.type}
                  onValueChange={(v) => {
                    const np = [...params]; np[i] = { ...p, type: v as Param["type"] }; setParams(np);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">string</SelectItem>
                    <SelectItem value="number">number</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex flex-col items-center gap-1">
                  <Switch
                    checked={p.required}
                    onCheckedChange={(v) => {
                      const np = [...params]; np[i] = { ...p, required: v }; setParams(np);
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">обяз.</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setParams(params.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Подсказка как использовать ответ (опционально)</Label>
            <Textarea
              rows={2}
              value={String(cfg.response_hint ?? "")}
              onChange={(e) => setCfg({ response_hint: e.target.value })}
              placeholder="Из ответа возьми поле status и скажи клиенту простыми словами."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={saving || !t.name || !t.agent_id}
            onClick={async () => {
              setSaving(true);
              try { await onSave(t); } finally { setSaving(false); }
            }}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
