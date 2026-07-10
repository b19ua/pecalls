import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Server, Cloud, Activity, Check, RefreshCw, KeyRound, Heart, AlertTriangle, Download, Trash2, UploadCloud } from "lucide-react";
import {
  getResidencyConfigFn,
  saveResidencyConfigFn,
  pingResidencyGatewayFn,
  gatewayHealthFn,
  listRecentTicketsFn,
  getCrmHealthFn,
} from "@/lib/data-residency.functions";
import { exportMyDataFn, eraseMyDataFn, syncToGatewayFn, listMyDsrRequestsFn } from "@/lib/gdpr.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/data-residency")({
  component: DataResidencyPage,
});

type Mode = "cloud" | "self_hosted";

function genHmacSecret(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function DataResidencyPage() {
  const { t } = useI18n();
  const get = useServerFn(getResidencyConfigFn);
  const save = useServerFn(saveResidencyConfigFn);
  const ping = useServerFn(pingResidencyGatewayFn);
  const health = useServerFn(gatewayHealthFn);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [mode, setMode] = useState<Mode>("cloud");
  const [enabled, setEnabled] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [purgeTwilio, setPurgeTwilio] = useState(true);
  const [proxyAudio, setProxyAudio] = useState(false);
  const [lastPing, setLastPing] = useState<{ at: string | null; ok: boolean | null; error: string | null }>({ at: null, ok: null, error: null });
  const [step, setStep] = useState<number>(0);
  const [wizard, setWizard] = useState(false);
  const [hc, setHc] = useState<{ ok: boolean; latencyMs?: number; info?: Record<string, unknown>; error?: string; checkedAt?: string } | null>(null);
  const [hcLoading, setHcLoading] = useState(false);

  useEffect(() => {
    get().then((cfg) => {
      setMode((cfg.mode as Mode) ?? "cloud");
      setEnabled(!!cfg.enabled);
      setGatewayUrl(cfg.gateway_url ?? "");
      setSecret(cfg.hmac_secret ?? "");
      setPurgeTwilio(cfg.purge_twilio_after_ingest ?? true);
      setProxyAudio(cfg.proxy_audio ?? false);
      setLastPing({ at: cfg.last_ping_at ?? null, ok: cfg.last_ping_ok ?? null, error: cfg.last_ping_error ?? null });
      setLoading(false);
    });
  }, [get]);

  const saveCfg = async (override?: Partial<{ mode: Mode; enabled: boolean; gateway_url: string; hmac_secret: string; purge_twilio_after_ingest: boolean; proxy_audio: boolean }>) => {
    setSaving(true);
    try {
      await save({ data: {
        mode: override?.mode ?? mode,
        enabled: override?.enabled ?? enabled,
        gateway_url: override?.gateway_url ?? gatewayUrl ?? null,
        hmac_secret: override?.hmac_secret ?? secret ?? null,
        purge_twilio_after_ingest: override?.purge_twilio_after_ingest ?? purgeTwilio,
        proxy_audio: override?.proxy_audio ?? proxyAudio,
      } });
      toast.success(t("dr.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("dr.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    if (mode === "self_hosted" && enabled) {
      if (!gatewayUrl.trim()) return toast.error(t("dr.gateway_url_required"));
      if (secret.trim().length < 16) return toast.error(t("dr.secret_too_short"));
    }
    await saveCfg();
  };

  const onPing = async () => {
    setPinging(true);
    try {
      const r = await ping();
      if (r.ok) toast.success(t("dr.gateway_reachable"));
      else toast.error(`${t("dr.ping_failed")}: ${r.error}`);
      const cfg = await get();
      setLastPing({ at: cfg.last_ping_at ?? null, ok: cfg.last_ping_ok ?? null, error: cfg.last_ping_error ?? null });
    } finally {
      setPinging(false);
    }
  };

  const runHealth = async () => {
    setHcLoading(true);
    try {
      const r = await health();
      setHc({ ...r, checkedAt: new Date().toISOString() });
    } finally { setHcLoading(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t("dr.copied")),
      () => toast.error(t("dr.copy_failed")),
    );
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("dr.loading")}</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <PageHeader
        title={t("dr.title")}
        description={t("dr.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={() => { setWizard(true); setStep(0); }}>
            <ShieldCheck className="h-4 w-4 mr-1.5" /> {t("dr.connect_onprem")}
          </Button>
        }
      />

      {wizard && (
        <Card className="bg-gradient-card shadow-elegant mb-5 border-primary/30">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{t("dr.wizard_title")}</h3>
              <Button variant="ghost" size="sm" onClick={() => setWizard(false)}>{t("dr.close")}</Button>
            </div>

            <Stepper step={step} steps={["HMAC", t("dr.step_address"), t("dr.step_verify"), t("dr.step_test")]} />

            {step === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("dr.step0_desc")}
                  <code className="mx-1 px-1 rounded bg-muted">LUNARA_HMAC_SECRET</code>
                  {t("dr.step0_desc2")}
                </p>
                <div className="flex gap-2">
                  <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="≥ 32 hex chars" />
                  <Button variant="outline" onClick={() => setSecret(genHmacSecret())}>
                    <KeyRound className="h-4 w-4 mr-1.5" /> {t("dr.generate")}
                  </Button>
                  <Button variant="outline" onClick={() => copyToClipboard(secret)} disabled={!secret}>{t("dr.copy")}</Button>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setStep(1)} disabled={secret.trim().length < 16}>{t("dr.next")}</Button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("dr.step1_desc")}</p>
                <Input value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} placeholder="https://gateway.client.internal" />
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>{t("dr.purge_twilio")}</Label>
                    <p className="text-xs text-muted-foreground">{t("dr.purge_twilio_hint")}</p>
                  </div>
                  <Switch checked={purgeTwilio} onCheckedChange={setPurgeTwilio} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>{t("dr.proxy_audio")}</Label>
                    <p className="text-xs text-muted-foreground">{t("dr.proxy_audio_hint")}</p>
                  </div>
                  <Switch checked={proxyAudio} onCheckedChange={setProxyAudio} />
                </div>
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(0)}>{t("dr.back")}</Button>
                  <Button onClick={async () => {
                    await saveCfg({ mode: "self_hosted", enabled: true, gateway_url: gatewayUrl, hmac_secret: secret, purge_twilio_after_ingest: purgeTwilio, proxy_audio: proxyAudio });
                    setMode("self_hosted"); setEnabled(true);
                    setStep(2);
                  }} disabled={!gatewayUrl.trim() || saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    {t("dr.save_continue")}
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("dr.step2_desc")} <code>/health</code> {t("dr.step2_desc2")}
                </p>
                <div className="flex gap-2">
                  <Button onClick={onPing} disabled={pinging}>
                    {pinging ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Activity className="h-4 w-4 mr-1.5" />}
                    {t("dr.check_connection")}
                  </Button>
                  <Button variant="outline" onClick={runHealth} disabled={hcLoading}>
                    {hcLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Heart className="h-4 w-4 mr-1.5" />}
                    {t("dr.extended_diag")}
                  </Button>
                </div>
                {lastPing.at && (
                  <div className="text-xs flex items-center gap-2">
                    <Badge variant={lastPing.ok ? "default" : "destructive"}>{lastPing.ok ? "Connected" : "Failed"}</Badge>
                    <span className="text-muted-foreground">{new Date(lastPing.at).toLocaleString()}</span>
                    {lastPing.error && <span className="text-destructive">{lastPing.error}</span>}
                  </div>
                )}
                {hc && <HealthBlock hc={hc} />}
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(1)}>{t("dr.back")}</Button>
                  <Button onClick={() => setStep(3)} disabled={!lastPing.ok}>{t("dr.next")}</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("dr.step3_desc")}</p>
                <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm flex items-start gap-2">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <div>{t("dr.step3_success")}</div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setWizard(false)}>{t("dr.done")}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-gradient-card shadow-soft mb-5">
        <CardContent className="p-5 space-y-5">
          <div>
            <Label className="mb-2 block">{t("dr.storage_mode")}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cloud"><div className="flex items-center gap-2"><Cloud className="h-4 w-4" /> Lunara cloud (default)</div></SelectItem>
                <SelectItem value="self_hosted"><div className="flex items-center gap-2"><Server className="h-4 w-4" /> Self-hosted Client Data Gateway</div></SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">{t("dr.storage_mode_desc")}</p>
          </div>

          {mode === "self_hosted" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t("dr.enabled")}</Label>
                  <p className="text-xs text-muted-foreground">{t("dr.enabled_hint")}</p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div>
                <Label htmlFor="gw">{t("dr.gateway_url")}</Label>
                <Input id="gw" placeholder="https://gateway.client.internal" value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} />
              </div>

              <div>
                <Label htmlFor="sec">{t("dr.hmac_secret")}</Label>
                <div className="flex gap-2">
                  <Input id="sec" type="password" placeholder="≥ 16 chars" value={secret} onChange={(e) => setSecret(e.target.value)} />
                  <Button variant="outline" type="button" onClick={() => setSecret(genHmacSecret())} title={t("dr.generate")}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-4">
                  <Label>{t("dr.purge_twilio")}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{t("dr.purge_twilio_desc")}</p>
                </div>
                <Switch checked={purgeTwilio} onCheckedChange={setPurgeTwilio} />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-4">
                  <Label>{t("dr.proxy_audio")}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{t("dr.proxy_audio_desc")}</p>
                </div>
                <Switch checked={proxyAudio} onCheckedChange={setProxyAudio} />
              </div>

              <div className="rounded-lg border p-3 text-xs flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  {t("dr.signed_headers")}
                  <code className="block mt-1">x-lunara-owner, x-lunara-timestamp, x-lunara-signature</code>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} {t("dr.save")}
            </Button>
            {mode === "self_hosted" && enabled && (
              <>
                <Button variant="outline" onClick={onPing} disabled={pinging}>
                  {pinging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                  {t("dr.test_connection")}
                </Button>
                <Button variant="outline" onClick={runHealth} disabled={hcLoading}>
                  {hcLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Heart className="h-4 w-4 mr-2" />}
                  {t("dr.health_dashboard")}
                </Button>
              </>
            )}
          </div>

          {lastPing.at && (
            <div className="text-xs flex items-center gap-2">
              {t("dr.last_check")}: {new Date(lastPing.at).toLocaleString()} ·{" "}
              <Badge variant={lastPing.ok ? "default" : "destructive"}>{lastPing.ok ? "OK" : "Failed"}</Badge>
              {lastPing.error && <span className="text-muted-foreground">{lastPing.error}</span>}
            </div>
          )}

          {hc && <HealthBlock hc={hc} />}
        </CardContent>
      </Card>

      <GdprCard selfHosted={mode === "self_hosted" && enabled} />

      <LocalCrmCard />





      <Card className="bg-gradient-card shadow-soft">
        <CardContent className="p-5 space-y-2 text-sm">
          <h3 className="font-display text-lg font-semibold">{t("dr.ref_title")}</h3>
          <p className="text-muted-foreground">
            {t("dr.ref_desc")}
          </p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1">
            <li><b>POST /calls/ingest</b> — {t("dr.ref_ingest")}</li>
            <li><b>GET /calls/:id</b> / <b>/audio</b> — {t("dr.ref_get")}</li>
            <li><b>GET /audit/log</b> — {t("dr.ref_audit")}</li>
            <li><b>GET /health</b>, <b>/ready</b> — {t("dr.ref_health")}</li>
            <li><b>RETENTION_DAYS</b> — {t("dr.ref_retention")}</li>
          </ul>
          <p className="text-xs text-muted-foreground pt-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-warning shrink-0" />
            {t("dr.ref_sso")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stepper({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center font-bold ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {i < step ? <Check className="h-3 w-3" /> : i + 1}
          </div>
          <span className={i <= step ? "" : "text-muted-foreground"}>{s}</span>
          {i < steps.length - 1 && <div className={`h-px w-6 ${i < step ? "bg-primary" : "bg-border"}`} />}
        </div>
      ))}
    </div>
  );
}

function HealthBlock({ hc }: { hc: { ok: boolean; latencyMs?: number; info?: Record<string, unknown>; error?: string; checkedAt?: string } }) {
  return (
    <div className="rounded-lg border p-3 text-xs space-y-1">
      <div className="flex items-center gap-2">
        <Badge variant={hc.ok ? "default" : "destructive"}>{hc.ok ? "Healthy" : "Unhealthy"}</Badge>
        {typeof hc.latencyMs === "number" && <span className="text-muted-foreground">{hc.latencyMs} ms</span>}
        {hc.checkedAt && <span className="text-muted-foreground">· {new Date(hc.checkedAt).toLocaleTimeString()}</span>}
      </div>
      {hc.error && <div className="text-destructive">{hc.error}</div>}
      {hc.info && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1">
          {Object.entries(hc.info).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-border/40 py-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono truncate">{typeof v === "boolean" ? (v ? "✓" : "✗") : String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type DsrRow = { id: string; kind: string; status: string; created_at: string; error: string | null };

function GdprCard({ selfHosted }: { selfHosted: boolean }) {
  const exportFn = useServerFn(exportMyDataFn);
  const eraseFn = useServerFn(eraseMyDataFn);
  const syncFn = useServerFn(syncToGatewayFn);
  const listDsr = useServerFn(listMyDsrRequestsFn);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<DsrRow[]>([]);

  const refresh = async () => {
    const r = await listDsr();
    setHistory(r as DsrRow[]);
  };
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onExport = async () => {
    setBusy("export");
    try {
      const r = await exportFn();
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lunara-gdpr-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(null); }
  };

  const onErase = async () => {
    const confirmed = window.prompt('Type ERASE to permanently delete all your data (cloud + on-prem if connected).');
    if (confirmed !== "ERASE") return;
    setBusy("erase");
    try {
      const r = await eraseFn({ data: { confirm: "ERASE", scope: ["calls","copilot","knowledge","agents","whispers"], include_onprem: true } });
      toast.success(`Erased. Cloud: ${JSON.stringify(r.cloud)}`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erase failed"); }
    finally { setBusy(null); }
  };

  const onSync = async () => {
    setBusy("sync");
    try {
      const r = await syncFn({ data: { include_knowledge: true, include_agents: true } });
      if (r.ok && "documents" in r) toast.success(`Synced ${r.documents} docs / ${r.chunks} chunks / ${r.agents + r.copilot_agents} agents`);
      else toast.error(("errors" in r && r.errors[0]) || ("error" in r && r.error) || "see history");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Sync failed"); }
    finally { setBusy(null); }
  };

  return (
    <Card className="bg-gradient-card shadow-soft mt-5 border-primary/20">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-semibold">GDPR &amp; Data Subject Rights</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Export everything we store about you (Art. 15), permanently erase it (Art. 17),
          {selfHosted ? " including the data mirrored on your on-prem gateway." : " plus your on-prem gateway data once connected."}
          {" "}Audit log keeps the proof of deletion.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onExport} disabled={!!busy}>
            {busy === "export" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export my data (JSON)
          </Button>
          <Button variant="destructive" onClick={onErase} disabled={!!busy}>
            {busy === "erase" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Erase everything
          </Button>
          {selfHosted && (
            <Button onClick={onSync} disabled={!!busy}>
              {busy === "sync" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />}
              Sync knowledge + agents to gateway
            </Button>
          )}
        </div>

        {history.length > 0 && (
          <div className="rounded-lg border divide-y text-xs">
            {history.slice(0, 8).map((h) => (
              <div key={h.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge variant={h.status === "done" ? "default" : h.status === "failed" ? "destructive" : "secondary"}>{h.kind}</Badge>
                  <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                </div>
                <span className={h.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{h.error ?? h.status}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LocalCrmCard() {
  const get = useServerFn(getResidencyConfigFn);
  const save = useServerFn(saveResidencyConfigFn);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status?: number; ms?: number; body?: string; error?: string } | null>(null);

  // Standalone state — independent toggle so disabling does NOT touch storage residency.
  const [crmEnabled, setCrmEnabled] = useState(false);
  const [crmUrl, setCrmUrl] = useState("http://10.8.0.2:8000/get-client-info");
  const [authHeader, setAuthHeader] = useState("");
  const [authValue, setAuthValue] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(2000);
  const [description, setDescription] = useState("");
  const [o1, setO1] = useState("object_1");
  const [o2, setO2] = useState("object_2");
  const [o3, setO3] = useState("object_3");
  // CRM #2 — Emergency Ticket Creation
  const [crm2Enabled, setCrm2Enabled] = useState(false);
  const [crm2Url, setCrm2Url] = useState("http://10.8.0.2:8000/create-ticket");
  const [crm2Timeout, setCrm2Timeout] = useState(3000);
  const [crm2Prompt, setCrm2Prompt] = useState("");
  const [testing2, setTesting2] = useState(false);
  const [testResult2, setTestResult2] = useState<{ ok: boolean; status?: number; ms?: number; body?: string; error?: string } | null>(null);
  const [tgBot, setTgBot] = useState("");
  const [tgChat, setTgChat] = useState("");
  const [notifyEsc, setNotifyEsc] = useState(true);
  const [tgTesting, setTgTesting] = useState(false);
  // Mirror of storage residency fields so saving CRM does not wipe them.
  const [snapshot, setSnapshot] = useState<{ mode: Mode; enabled: boolean; gateway_url: string; hmac_secret: string; purge_twilio_after_ingest: boolean; proxy_audio: boolean } | null>(null);

  useEffect(() => {
    get().then((cfg) => {
      setCrmEnabled(!!cfg.crm_enabled);
      setCrmUrl(cfg.crm_url ?? "http://10.8.0.2:8000/get-client-info");
      setAuthHeader(cfg.crm_auth_header ?? "");
      setAuthValue(cfg.crm_auth_value ?? "");
      setTimeoutMs(cfg.crm_timeout_ms ?? 2000);
      setDescription(cfg.crm_tool_description ?? "Get caller info from local CRM by phone number. Returns three fields about the customer.");
      setO1(cfg.crm_object1_label ?? "object_1");
      setO2(cfg.crm_object2_label ?? "object_2");
      setO3(cfg.crm_object3_label ?? "object_3");
      setCrm2Enabled(!!cfg.crm2_enabled);
      setCrm2Url(cfg.crm2_url ?? "http://10.8.0.2:8000/create-ticket");
      setCrm2Timeout(cfg.crm2_timeout_ms ?? 3000);
      setCrm2Prompt(cfg.crm2_system_prompt_template ?? "");
      setTgBot(cfg.supervisor_telegram_bot_token ?? "");
      setTgChat(cfg.supervisor_telegram_chat_id ?? "");
      setNotifyEsc(cfg.notify_on_escalation ?? true);
      setSnapshot({
        mode: (cfg.mode as Mode) ?? "cloud",
        enabled: !!cfg.enabled,
        gateway_url: cfg.gateway_url ?? "",
        hmac_secret: cfg.hmac_secret ?? "",
        purge_twilio_after_ingest: cfg.purge_twilio_after_ingest ?? true,
        proxy_audio: cfg.proxy_audio ?? false,
      });
      setLoading(false);
    });
  }, [get]);

  const onSave = async () => {
    if (!snapshot) return;
    if (crmEnabled && !crmUrl.trim()) {
      toast.error("Connector URL is required when CRM integration is enabled");
      return;
    }
    if (crm2Enabled && !crm2Url.trim()) {
      toast.error("Ticket connector URL is required when CRM #2 is enabled");
      return;
    }
    const clampedT2 = Math.min(Math.max(Number(crm2Timeout) || 3000, 1000), 10000);
    setSaving(true);
    try {
      await save({ data: {
        mode: snapshot.mode,
        enabled: snapshot.enabled,
        gateway_url: snapshot.gateway_url || null,
        hmac_secret: snapshot.hmac_secret || null,
        purge_twilio_after_ingest: snapshot.purge_twilio_after_ingest,
        proxy_audio: snapshot.proxy_audio,
        crm_enabled: crmEnabled,
        crm_url: crmUrl.trim() || null,
        crm_auth_header: authHeader,
        crm_auth_value: authValue,
        crm_timeout_ms: timeoutMs,
        crm_tool_description: description,
        crm_object1_label: o1,
        crm_object2_label: o2,
        crm_object3_label: o3,
        crm2_enabled: crm2Enabled,
        crm2_url: crm2Url.trim() || null,
        crm2_timeout_ms: clampedT2,
        crm2_system_prompt_template: crm2Prompt,
        supervisor_telegram_bot_token: tgBot.trim() || null,
        supervisor_telegram_chat_id: tgChat.trim() || null,
        notify_on_escalation: notifyEsc,
      } });
      toast.success("CRM integration saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  const onTest2 = async () => {
    setTesting2(true); setTestResult2(null);
    const t0 = Date.now();
    try {
      const ctl = new AbortController();
      const tid = setTimeout(() => ctl.abort(), Math.min(crm2Timeout + 500, 11000));
      const r = await fetch(crm2Url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: "+10000000000",
          nlc_number: "1234567",
          facility_address: "Test street 1",
          emergency_type: "no_light_individual",
          caller_comment: "Test ticket from data-residency UI",
        }),
        signal: ctl.signal,
      });
      clearTimeout(tid);
      const body = (await r.text()).slice(0, 600);
      setTestResult2({ ok: r.ok, status: r.status, ms: Date.now() - t0, body });
    } catch (e) {
      setTestResult2({ ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
    } finally { setTesting2(false); }
  };

  const onTest = async () => {
    setTesting(true); setTestResult(null);
    const t0 = Date.now();
    try {
      const ctl = new AbortController();
      const tid = setTimeout(() => ctl.abort(), Math.min(timeoutMs + 500, 10000));
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authHeader && authValue) headers[authHeader] = authValue;
      const r = await fetch(crmUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone_number: "+10000000000" }),
        signal: ctl.signal,
      });
      clearTimeout(tid);
      const body = (await r.text()).slice(0, 600);
      setTestResult({ ok: r.ok, status: r.status, ms: Date.now() - t0, body });
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
    } finally { setTesting(false); }
  };

  if (loading) return null;

  return (
    <Card className="bg-gradient-card shadow-soft mt-5 border-primary/20">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-semibold">Local CRM Integration (Live Tool Calling)</h3>
        </div>

        <Tabs defaultValue="crm1">
          <TabsList>
            <TabsTrigger value="crm1">CRM #1: Client Lookup</TabsTrigger>
            <TabsTrigger value="crm2">CRM #2: Emergency Ticket Creation</TabsTrigger>
          </TabsList>

          <TabsContent value="crm1" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                When enabled, the AI agent can call your local CRM connector over VPN during a live call
                and enrich the conversation with three customer fields. Fully isolated toggle.
              </p>
              <Switch checked={crmEnabled} onCheckedChange={setCrmEnabled} />
            </div>

            <div className="grid gap-3">
              <div>
                <Label htmlFor="crm-url">Local connector URL (VPN)</Label>
                <Input id="crm-url" value={crmUrl} onChange={(e) => setCrmUrl(e.target.value)} placeholder="http://10.8.0.2:8000/get-client-info" />
                <p className="text-xs text-muted-foreground mt-1">
                  Recommended: deploy WireGuard on the client side, expose the connector only inside the VPN
                  (e.g. <code>10.8.0.2:8000</code>). Endpoint must accept <code>POST &#123;"phone_number":"..."&#125;</code> and
                  return JSON with <code>object_1</code>, <code>object_2</code>, <code>object_3</code>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="crm-ah">Auth header name (optional)</Label>
                  <Input id="crm-ah" value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} placeholder="X-API-Key" />
                </div>
                <div>
                  <Label htmlFor="crm-av">Auth header value (optional)</Label>
                  <Input id="crm-av" type="password" value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder="••••••••" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="crm-to">Hard timeout (ms)</Label>
                  <Input id="crm-to" type="number" min={500} max={10000} value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value) || 2000)} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>Field 1 name</Label><Input value={o1} onChange={(e) => setO1(e.target.value)} /></div>
                  <div><Label>Field 2 name</Label><Input value={o2} onChange={(e) => setO2(e.target.value)} /></div>
                  <div><Label>Field 3 name</Label><Input value={o3} onChange={(e) => setO3(e.target.value)} /></div>
                </div>
              </div>

              <div>
                <Label htmlFor="crm-desc">Tool description for AI (what the data means)</Label>
                <Input id="crm-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={onSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save CRM settings
              </Button>
              <Button variant="outline" onClick={onTest} disabled={testing || !crmUrl.trim()}>
                {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                Test connector
              </Button>
            </div>

            {testResult && (
              <div className="rounded-lg border p-3 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={testResult.ok ? "default" : "destructive"}>
                    {testResult.ok ? `OK ${testResult.status}` : `Failed ${testResult.status ?? ""}`}
                  </Badge>
                  {typeof testResult.ms === "number" && <span className="text-muted-foreground">{testResult.ms} ms</span>}
                </div>
                {testResult.error && <div className="text-destructive">{testResult.error}</div>}
                {testResult.body && <pre className="font-mono whitespace-pre-wrap break-all text-[11px]">{testResult.body}</pre>}
                <p className="text-muted-foreground">
                  Note: this test runs from your browser, not the calling Edge Function. Browser test ≠ runtime reachability.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="crm2" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Emergency Ticket Creation (create_emergency_ticket)</p>
                <p className="text-sm text-muted-foreground">
                  When enabled, the AI agent can create emergency outage tickets in your second local system.
                  Requests are HMAC-SHA256 signed with the residency shared secret
                  (headers <code>X-CRM-Signature</code>, <code>X-CRM-Timestamp</code>).
                </p>
              </div>
              <Switch checked={crm2Enabled} onCheckedChange={setCrm2Enabled} />
            </div>

            <div className="grid gap-3">
              <div>
                <Label htmlFor="crm2-url">Ticket connector URL (VPN)</Label>
                <Input id="crm2-url" value={crm2Url} onChange={(e) => setCrm2Url(e.target.value)} placeholder="http://10.8.0.2:8000/create-ticket" />
              </div>
              <div>
                <Label htmlFor="crm2-url-backup">Backup URL (multi-region failover)</Label>
                <Input id="crm2-url-backup" value={crm2UrlBackup} onChange={(e) => setCrm2UrlBackup(e.target.value)} placeholder="http://10.8.0.3:8000/create-ticket" />
                <p className="text-xs text-muted-foreground mt-1">Используется автоматически при недоступности основного URL.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="crm2-to">Hard timeout (ms, 1000–10000)</Label>
                  <Input
                    id="crm2-to"
                    type="number"
                    min={1000}
                    max={10000}
                    value={crm2Timeout}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 3000;
                      setCrm2Timeout(Math.min(Math.max(v, 1000), 10000));
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                  <strong className="text-amber-500 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Инструкция для ИИ по авариям
                  </strong>
                  <p className="mt-1">
                    Обязательно пропишите инструкцию для Gemini: перед вызовом функции создания заявки робот
                    обязан перечислить клиенту адрес (или NLC) и тип проблемы и получить чёткое устное согласие
                    («Да»). Если обнаружен обрыв провода, ИИ обязан сказать:
                    <em> «Пожалуйста, не приближайтесь к проводу ближе чем на 8 метров!»</em>
                  </p>
                </div>
                <Textarea
                  className="mt-2 min-h-[180px] font-mono text-xs"
                  value={crm2Prompt}
                  onChange={(e) => setCrm2Prompt(e.target.value)}
                  placeholder={`Перед создание заявки:\n1. Перечисли адрес (или NLC) и emergency_type клиенту.\n2. Получи устное «Да».\n3. Если emergency_type = wire_down_danger — обязательно скажи: «Пожалуйста, не приближайтесь к проводу ближе чем на 8 метров!»\n4. Только после этого вызывай create_emergency_ticket.`}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={onSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
              </Button>
              <Button variant="outline" onClick={onTest2} disabled={testing2 || !crm2Url.trim()}>
                {testing2 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                Test ticket creation
              </Button>
            </div>

            {testResult2 && (
              <div className="rounded-lg border p-3 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={testResult2.ok ? "default" : "destructive"}>
                    {testResult2.ok ? `OK ${testResult2.status}` : `Failed ${testResult2.status ?? ""}`}
                  </Badge>
                  {typeof testResult2.ms === "number" && <span className="text-muted-foreground">{testResult2.ms} ms</span>}
                </div>
                {testResult2.error && <div className="text-destructive">{testResult2.error}</div>}
                {testResult2.body && <pre className="font-mono whitespace-pre-wrap break-all text-[11px]">{testResult2.body}</pre>}
                <p className="text-muted-foreground">
                  Browser test sends an unsigned request. The Edge Function will add HMAC signature headers at runtime.
                </p>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Supervisor Telegram alerts</p>
                  <p className="text-xs text-muted-foreground">Notify supervisor when a ticket is escalated after {`{max_attempts}`} failed retries.</p>
                </div>
                <Switch checked={notifyEsc} onCheckedChange={setNotifyEsc} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tg-bot">Bot token</Label>
                  <Input id="tg-bot" value={tgBot} onChange={(e) => setTgBot(e.target.value)} placeholder="123456:ABC-DEF..." />
                </div>
                <div>
                  <Label htmlFor="tg-chat">Chat ID</Label>
                  <Input id="tg-chat" value={tgChat} onChange={(e) => setTgChat(e.target.value)} placeholder="-100123456 or 987654321" />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={tgTesting || !tgBot.trim() || !tgChat.trim()}
                onClick={async () => {
                  setTgTesting(true);
                  try {
                    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(tgBot.trim())}/sendMessage`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ chat_id: tgChat.trim(), text: "✅ Lunara: тестовое сообщение супервайзеру", parse_mode: "HTML" }),
                    });
                    if (r.ok) toast.success("Test message sent");
                    else toast.error(`Telegram: ${r.status} ${(await r.text()).slice(0, 200)}`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Telegram send failed");
                  } finally { setTgTesting(false); }
                }}
              >
                {tgTesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                Send test alert
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Как получить: создайте бота у @BotFather → сохраните токен. Добавьте бота в группу (или отправьте ему /start), затем узнайте chat_id через @userinfobot или через API <code>getUpdates</code>. Токен хранится в вашей записи data_residency_configs и используется только серверными хуками.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <RecentTicketsSection />
    </Card>
  );
}

function RecentTicketsSection() {
  const listTickets = useServerFn(listRecentTicketsFn);
  const getHealth = useServerFn(getCrmHealthFn);
  const [tickets, setTickets] = useState<Array<{
    id: string; created_at: string; status: string; attempts: number; latency_ms: number | null;
    emergency_type: string | null; phone_number: string | null; nlc_number: string | null;
    facility_address: string | null; external_ticket_id: string | null; last_error: string | null;
    call_sid: string | null;
  }>>([]);
  const [health, setHealth] = useState<Array<{
    crm_id: string; consecutive_failures: number; breaker_open_until: string | null;
    last_success_at: string | null; last_failure_at: string | null; last_error: string | null;
  }>>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [t, h] = await Promise.all([listTickets({ data: { limit: 50 } }), getHealth()]);
      setTickets(t.tickets);
      setHealth(h.rows);
    } catch (e) {
      console.error("tickets refresh", e);
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); const id = setInterval(refresh, 15000); return () => clearInterval(id); }, []);

  return (
    <CardContent className="border-t pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Recent tickets (audit log)</p>
          <p className="text-xs text-muted-foreground">Все попытки создания аварийных заявок за последнее время. Обновляется каждые 15 секунд.</p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {health.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {health.map((h) => {
            const breakerOpen = h.breaker_open_until && new Date(h.breaker_open_until).getTime() > Date.now();
            return (
              <div key={h.crm_id} className="rounded-md border px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant={breakerOpen ? "destructive" : h.consecutive_failures > 0 ? "secondary" : "default"}>
                    {h.crm_id}
                  </Badge>
                  {breakerOpen ? (
                    <span className="text-destructive">Breaker OPEN до {new Date(h.breaker_open_until!).toLocaleTimeString()}</span>
                  ) : (
                    <span className="text-muted-foreground">fails: {h.consecutive_failures}</span>
                  )}
                </div>
                {h.last_success_at && <div className="text-muted-foreground">✓ {new Date(h.last_success_at).toLocaleString()}</div>}
                {h.last_error && <div className="text-destructive truncate max-w-[280px]">{h.last_error}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">Time</th>
              <th className="p-2">Status</th>
              <th className="p-2">Type</th>
              <th className="p-2">Phone / NLC / Addr</th>
              <th className="p-2">Ticket #</th>
              <th className="p-2">Attempts</th>
              <th className="p-2">Latency</th>
              <th className="p-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr><td className="p-3 text-muted-foreground" colSpan={8}>Заявок пока нет.</td></tr>
            )}
            {tickets.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                <td className="p-2">
                  <Badge variant={t.status === "success" ? "default" : t.status === "failed" ? "destructive" : "secondary"}>{t.status}</Badge>
                </td>
                <td className="p-2">{t.emergency_type ?? "-"}</td>
                <td className="p-2">{[t.phone_number, t.nlc_number, t.facility_address].filter(Boolean).join(" / ") || "-"}</td>
                <td className="p-2 font-mono">{t.external_ticket_id ?? "-"}</td>
                <td className="p-2">{t.attempts}</td>
                <td className="p-2">{t.latency_ms != null ? `${t.latency_ms} ms` : "-"}</td>
                <td className="p-2 text-destructive max-w-[220px] truncate">{t.last_error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent>
  );
}


