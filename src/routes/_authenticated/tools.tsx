import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listTools, saveTool, deleteTool, listAgentsForTools, testTool } from "@/lib/tools.functions";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Pencil, Loader2, Wrench, Webhook, Database, Info, Zap, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";


export const Route = createFileRoute("/_authenticated/tools")({
  component: ToolsPage,
});

type ToolType = "webhook" | "crm_lookup" | "crm_write";
type Param = { name: string; type: "string" | "number" | "boolean"; description: string; required: boolean; query_key?: string };

type ToolRow = {
  id: string;
  agent_id: string;
  type: ToolType;
  name: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown>;
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
  const { t } = useI18n();
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

  const typeLabel = (type: ToolType) =>
    ({ webhook: t("tools.type_webhook"), crm_lookup: t("tools.type_crm_lookup"), crm_write: t("tools.type_crm_write") }[type]);

  const load = async () => {
    setLoading(true);
    try {
      const [toolsData, agentsData] = await Promise.all([listFn({ data: {} }), listAgentsFn()]);
      setTools(toolsData.tools as ToolRow[]);
      setAgents(agentsData.agents);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tools.error_load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => (agentFilter === "all" ? tools : tools.filter((tool) => tool.agent_id === agentFilter)),
    [tools, agentFilter],
  );

  const startCreate = () => {
    const firstAgent = agents[0]?.id;
    if (!firstAgent) {
      toast.error(t("tools.error_no_agent"));
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

  const startEdit = (tool: ToolRow) => {
    setEditing(JSON.parse(JSON.stringify(tool)));
    setOpen(true);
  };

  const remove = async (id: string) => {
    if (!confirm(t("tools.confirm_delete"))) return;
    try {
      await delFn({ data: { id } });
      toast.success(t("tools.deleted"));
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tools.error"));
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title={t("tools.title")}
        description={t("tools.subtitle")}
        actions={
          <Button onClick={startCreate} className="bg-gradient-primary shadow-elegant">
            <Plus className="h-4 w-4 mr-1.5" /> {t("tools.new_tool")}
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <Label className="text-sm">{t("tools.agent")}:</Label>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tools.all_agents")}</SelectItem>
            {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-8">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("tools.loading")}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-gradient-card shadow-soft">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />
            {t("tools.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((tool) => {
            const Icon = TYPE_ICON[tool.type];
            const agent = agents.find((a) => a.id === tool.agent_id);
            return (
              <Card key={tool.id} className="bg-gradient-card shadow-soft">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{tool.name}</h3>
                      <Badge variant="secondary">{typeLabel(tool.type)}</Badge>
                      {agent && <Badge variant="outline">{agent.name}</Badge>}
                      {!tool.enabled && <Badge variant="destructive">{t("tools.disabled")}</Badge>}
                    </div>
                    {tool.description && <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                      {String((tool.config as { url?: string; base_url?: string; path?: string }).url
                        ?? `${(tool.config as { base_url?: string }).base_url ?? ""}${(tool.config as { path?: string }).path ?? ""}`)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(tool)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(tool.id)}><Trash2 className="h-4 w-4" /></Button>
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
        onSave={async (tool) => {
          try {
            await saveFn({
              data: {
                id: tool.id || null,
                data: {
                  agent_id: tool.agent_id,
                  type: tool.type,
                  name: tool.name,
                  description: tool.description,
                  enabled: tool.enabled,
                  config: tool.config,
                },
              },
            });
            toast.success(t("tools.saved"));
            setOpen(false);
            setEditing(null);
            void load();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("tools.error"));
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
  onSave: (row: ToolRow) => Promise<void>;
}) {
  const { t } = useI18n();
  const [row, setRow] = useState<ToolRow | null>(tool);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testArgs, setTestArgs] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<null | {
    ok: boolean;
    status?: number;
    latency_ms?: number;
    stage: string;
    preview?: string;
    error?: string;
    hint?: string;
    request?: { url: string; method: string; has_body: boolean };
    full_bytes?: number;
  }>(null);
  const testFn = useServerFn(testTool);

  useEffect(() => { setRow(tool); setTestResult(null); setTestArgs({}); }, [tool]);

  if (!row) return null;
  const cfg = row.config as Record<string, unknown>;
  const setCfg = (patch: Record<string, unknown>) => setRow({ ...row, config: { ...cfg, ...patch } });
  const params = (cfg.parameters as Param[]) ?? [];
  const setParams = (p: Param[]) => setCfg({ parameters: p });
  const provider = String(cfg.provider ?? "custom");

  const presets = (() => {
    if (provider === "bitrix24") {
      return {
        baseUrl: "https://ваш-портал.bitrix24.ru/rest/1/xxxxxxxxxxxx",
        lookupPath: "/crm.contact.list.json",
        writePath: "/crm.lead.add.json",
        bodyTemplate: '{"fields":{"TITLE":"{call_summary}","PHONE":[{"VALUE":"{phone_number}","VALUE_TYPE":"WORK"}]}}',
        pathHint: "Bitrix24 требует метод в пути запроса, не в теле (например /crm.contact.list.json).",
      };
    }
    if (provider === "hubspot") {
      return {
        baseUrl: "https://api.hubapi.com",
        lookupPath: "/crm/v3/objects/contacts/search",
        writePath: "/crm/v3/objects/contacts",
        bodyTemplate: '{\n  "properties": { "phone": "{phone_number}", "firstname": "{name}" }\n}',
        pathHint: "",
      };
    }
    if (provider === "salesforce") {
      return {
        baseUrl: "https://your-instance.my.salesforce.com",
        lookupPath: "/services/data/v60.0/query/?q=SELECT+Id,Name,Phone+FROM+Contact",
        writePath: "/services/data/v60.0/sobjects/Lead",
        bodyTemplate: '{\n  "LastName": "{name}",\n  "Company": "{company}",\n  "Phone": "{phone_number}"\n}',
        pathHint: "",
      };
    }
    return { baseUrl: "https://api.example.com", lookupPath: "/lookup", writePath: "/create", bodyTemplate: '{\n  "phone": "{phone_number}"\n}', pathHint: "" };
  })();


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row.id ? t("tools.edit_tool") : t("tools.new_tool")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("tools.agent")}</Label>
              <Select value={row.agent_id} onValueChange={(v) => setRow({ ...row, agent_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("tools.type")}</Label>
              <Select
                value={row.type}
                onValueChange={(v) => {
                  const newType = v as ToolType;
                  setRow({ ...row, type: newType, config: emptyConfig(newType) });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="webhook">{t("tools.type_webhook")}</SelectItem>
                  <SelectItem value="crm_lookup">{t("tools.type_crm_lookup_full")}</SelectItem>
                  <SelectItem value="crm_write">{t("tools.type_crm_write_full")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("tools.func_name")}</Label>
            <Input
              value={row.name}
              onChange={(e) => setRow({ ...row, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
              placeholder="get_order_status"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("tools.description_label")}</Label>
            <Textarea
              rows={2}
              value={row.description}
              onChange={(e) => setRow({ ...row, description: e.target.value })}
              placeholder={t("tools.description_placeholder")}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>{t("tools.enabled")}</Label>
            <Switch checked={row.enabled} onCheckedChange={(v) => setRow({ ...row, enabled: v })} />
          </div>

          <Separator />

          {row.type === "webhook" ? (
            <>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div className="space-y-1.5">
                  <Label>URL</Label>
                  <Input value={String(cfg.url ?? "")} onChange={(e) => setCfg({ url: e.target.value })} placeholder="https://api.example.com/orders" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("tools.method")}</Label>
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
                <Label>{t("tools.crm_provider")}</Label>
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
              {provider === "bitrix24" && (
                <Alert className="border-primary/30 bg-primary/5">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs leading-relaxed">
                    <b>Bitrix24 REST:</b> метод API идёт в пути (например <code>/crm.contact.list.json</code>).
                    Для фильтров вида <code>filter[PHONE]</code> используйте поле <b>query key override</b>
                    в параметре ниже — оно передаст ключ как есть в query-строку без экранирования скобок.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label>Base URL</Label>
                <Input value={String(cfg.base_url ?? "")} onChange={(e) => setCfg({ base_url: e.target.value })} placeholder={presets.baseUrl} />
              </div>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div className="space-y-1.5">
                  <Label>{t("tools.path_label")}</Label>
                  <Input
                    value={String(cfg.path ?? "")}
                    onChange={(e) => setCfg({ path: e.target.value })}
                    placeholder={row.type === "crm_write" ? presets.writePath : presets.lookupPath}
                  />
                  {presets.pathHint && <p className="text-[11px] text-muted-foreground">{presets.pathHint}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>{t("tools.method")}</Label>
                  <Select value={String(cfg.method ?? "GET")} onValueChange={(v) => setCfg({ method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["GET","POST","PUT","PATCH"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {row.type === "crm_write" && (
                <div className="space-y-1.5">
                  <Label>{t("tools.body_label")}</Label>
                  <Textarea
                    rows={4}
                    className="font-mono text-xs"
                    value={String(cfg.body_template ?? "")}
                    onChange={(e) => setCfg({ body_template: e.target.value })}
                    placeholder={presets.bodyTemplate}
                  />
                </div>
              )}

            </>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("tools.auth_header_name")}</Label>
              <Input value={String(cfg.auth_header_name ?? "")} onChange={(e) => setCfg({ auth_header_name: e.target.value })} placeholder="Authorization" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("tools.auth_header_value")}</Label>
              <Input type="password" value={String(cfg.auth_header_value ?? "")} onChange={(e) => setCfg({ auth_header_value: e.target.value })} placeholder="Bearer ..." />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("tools.params_label")}</Label>
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => setParams([...params, { name: "", type: "string", description: "", required: true, query_key: "" }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> {t("tools.add_param")}
              </Button>
            </div>
            {params.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("tools.params_hint")}</p>
            )}
            {params.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2 items-start border rounded-md p-2">
                <div className="space-y-1">
                  <Input
                    placeholder={t("tools.param_name_placeholder")}
                    value={p.name}
                    onChange={(e) => {
                      const np = [...params];
                      np[i] = { ...p, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") };
                      setParams(np);
                    }}
                  />
                  <Input
                    placeholder={t("tools.param_desc_placeholder")}
                    value={p.description}
                    onChange={(e) => {
                      const np = [...params]; np[i] = { ...p, description: e.target.value }; setParams(np);
                    }}
                  />
                  <Input
                    placeholder='query key override (optional, e.g. "filter[PHONE]")'
                    value={p.query_key ?? ""}
                    onChange={(e) => {
                      const np = [...params];
                      // Allow letters, digits, _.-[] (URLSearchParams will percent-encode the VALUE;
                      // the key format above is enough for Bitrix24 / JSON:API / dotted paths).
                      np[i] = { ...p, query_key: e.target.value.replace(/[^A-Za-z0-9_.\-\[\]]/g, "") };
                      setParams(np);
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
                  <span className="text-[10px] text-muted-foreground">{t("tools.required")}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setParams(params.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>{t("tools.response_hint_label")}</Label>
            <Textarea
              rows={2}
              value={String(cfg.response_hint ?? "")}
              onChange={(e) => setCfg({ response_hint: e.target.value })}
              placeholder={t("tools.response_hint_placeholder")}
            />
          </div>

          <Separator />

          {/* Test connection panel — uses the shared buildToolRequest (same as bridges). */}
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <Label className="text-sm">Test connection</Label>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  setTestResult(null);
                  try {
                    // Coerce test inputs to declared types.
                    const args: Record<string, unknown> = {};
                    for (const p of params) {
                      if (!p.name) continue;
                      const raw = testArgs[p.name] ?? "";
                      if (raw === "" && !p.required) continue;
                      if (p.type === "number") args[p.name] = Number(raw);
                      else if (p.type === "boolean") args[p.name] = raw === "true" || raw === "1";
                      else args[p.name] = raw;
                    }
                    const res = await testFn({
                      data: { type: row.type, config: row.config, args },
                    });
                    setTestResult(res as typeof testResult);
                  } catch (e) {
                    setTestResult({
                      ok: false, stage: "client",
                      error: e instanceof Error ? e.message : String(e),
                      hint: "Не удалось выполнить тест — проверьте, что конфигурация валидна.",
                    });
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                Проверить
              </Button>
            </div>
            {params.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  Тестовые значения параметров (используются только для проверки, не сохраняются):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {params.filter((p) => p.name).map((p) => (
                    <div key={p.name} className="space-y-1">
                      <Label className="text-[11px] font-mono">
                        {p.name}{p.required && <span className="text-destructive"> *</span>}
                        <span className="ml-1 text-muted-foreground">({p.type})</span>
                      </Label>
                      <Input
                        className="h-8 text-xs"
                        placeholder={p.description || `тестовое значение ${p.name}`}
                        value={testArgs[p.name] ?? ""}
                        onChange={(e) => setTestArgs({ ...testArgs, [p.name]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {testResult && (
              <div className="rounded-md bg-muted/40 p-2 text-xs space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {testResult.ok
                    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                    : <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="font-medium">
                    {testResult.ok ? "Успешно" : "Ошибка"}
                  </span>
                  {typeof testResult.status === "number" && (
                    <Badge variant={testResult.ok ? "secondary" : "destructive"}>HTTP {testResult.status}</Badge>
                  )}
                  {typeof testResult.latency_ms === "number" && (
                    <Badge variant="outline">{testResult.latency_ms} мс</Badge>
                  )}
                  <Badge variant="outline">stage: {testResult.stage}</Badge>
                </div>
                {testResult.request && (
                  <p className="font-mono text-[10px] text-muted-foreground break-all">
                    {testResult.request.method} {testResult.request.url}
                  </p>
                )}
                {testResult.hint && (
                  <p className="text-[11px] text-primary">{testResult.hint}</p>
                )}
                {testResult.error && (
                  <p className="text-[11px] text-destructive break-all">{testResult.error}</p>
                )}
                {testResult.preview && (
                  <pre className="whitespace-pre-wrap break-all font-mono text-[10px] leading-snug max-h-40 overflow-auto">
                    {testResult.preview}
                    {typeof testResult.full_bytes === "number" && testResult.full_bytes > 500 && (
                      <span className="text-muted-foreground">{"\n"}(показаны первые 500 из {testResult.full_bytes} байт)</span>
                    )}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>


        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("tools.cancel")}</Button>
          <Button
            disabled={saving || !row.name || !row.agent_id}
            onClick={async () => {
              setSaving(true);
              try { await onSave(row); } finally { setSaving(false); }
            }}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t("tools.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
