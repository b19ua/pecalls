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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Server, Cloud, Activity, Check, RefreshCw, KeyRound, Heart, AlertTriangle, Download, Trash2, UploadCloud } from "lucide-react";
import {
  getResidencyConfigFn,
  saveResidencyConfigFn,
  pingResidencyGatewayFn,
  gatewayHealthFn,
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
