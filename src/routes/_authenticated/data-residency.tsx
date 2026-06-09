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
import { Loader2, ShieldCheck, Server, Cloud, Activity, Check, RefreshCw, KeyRound, Heart, AlertTriangle } from "lucide-react";
import {
  getResidencyConfigFn,
  saveResidencyConfigFn,
  pingResidencyGatewayFn,
  gatewayHealthFn,
} from "@/lib/data-residency.functions";

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
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    if (mode === "self_hosted" && enabled) {
      if (!gatewayUrl.trim()) return toast.error("Gateway URL is required");
      if (secret.trim().length < 16) return toast.error("Secret must be ≥ 16 chars");
    }
    await saveCfg();
  };

  const onPing = async () => {
    setPinging(true);
    try {
      const r = await ping();
      if (r.ok) toast.success("Gateway reachable");
      else toast.error(`Ping failed: ${r.error}`);
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

  const copyToClipboard = (t: string, label: string) => {
    navigator.clipboard.writeText(t).then(
      () => toast.success(`${label} скопировано`),
      () => toast.error("Не удалось скопировать"),
    );
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <PageHeader
        title="Data residency"
        description="Choose where call recordings and transcripts are stored: in Lunara cloud or on your own Client Data Gateway."
        actions={
          <Button variant="outline" size="sm" onClick={() => { setWizard(true); setStep(0); }}>
            <ShieldCheck className="h-4 w-4 mr-1.5" /> Подключить on-prem (мастер)
          </Button>
        }
      />

      {wizard && (
        <Card className="bg-gradient-card shadow-elegant mb-5 border-primary/30">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Установочный мастер — Client Data Gateway</h3>
              <Button variant="ghost" size="sm" onClick={() => setWizard(false)}>Закрыть</Button>
            </div>

            <Stepper step={step} steps={["HMAC", "Адрес", "Проверка", "Тест записи"]} />

            {step === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Сгенерируйте общий секрет HMAC. Этот же ключ нужно положить на ваш сервер в переменную
                  <code className="mx-1 px-1 rounded bg-muted">LUNARA_HMAC_SECRET</code>. Lunara подписывает каждый запрос —
                  без секрета шлюз отвергнет вызов.
                </p>
                <div className="flex gap-2">
                  <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="≥ 32 hex chars" />
                  <Button variant="outline" onClick={() => setSecret(genHmacSecret())}>
                    <KeyRound className="h-4 w-4 mr-1.5" /> Сгенерировать
                  </Button>
                  <Button variant="outline" onClick={() => copyToClipboard(secret, "Секрет")} disabled={!secret}>Copy</Button>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setStep(1)} disabled={secret.trim().length < 16}>Далее</Button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Укажите URL вашего гейтвея. Он должен быть достижим из инфраструктуры Lunara (публичный
                  HTTPS, либо WireGuard/VPN с маршрутизируемым хостнеймом).
                </p>
                <Input value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} placeholder="https://gateway.client.internal" />
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Удалять записи из Twilio после ингеста</Label>
                    <p className="text-xs text-muted-foreground">Zero-retention на стороне оператора связи.</p>
                  </div>
                  <Switch checked={purgeTwilio} onCheckedChange={setPurgeTwilio} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Проксировать аудио через Lunara</Label>
                    <p className="text-xs text-muted-foreground">Включите, если гейтвей доступен только из нашего VPN.</p>
                  </div>
                  <Switch checked={proxyAudio} onCheckedChange={setProxyAudio} />
                </div>
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(0)}>Назад</Button>
                  <Button onClick={async () => {
                    await saveCfg({ mode: "self_hosted", enabled: true, gateway_url: gatewayUrl, hmac_secret: secret, purge_twilio_after_ingest: purgeTwilio, proxy_audio: proxyAudio });
                    setMode("self_hosted"); setEnabled(true);
                    setStep(2);
                  }} disabled={!gatewayUrl.trim() || saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    Сохранить и продолжить
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Проверим связь и подписанные заголовки. Lunara отправит GET <code>/health</code> с подписью.
                </p>
                <div className="flex gap-2">
                  <Button onClick={onPing} disabled={pinging}>
                    {pinging ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Activity className="h-4 w-4 mr-1.5" />}
                    Проверить связь
                  </Button>
                  <Button variant="outline" onClick={runHealth} disabled={hcLoading}>
                    {hcLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Heart className="h-4 w-4 mr-1.5" />}
                    Расширенная диагностика
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
                  <Button variant="ghost" onClick={() => setStep(1)}>Назад</Button>
                  <Button onClick={() => setStep(3)} disabled={!lastPing.ok}>Далее</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Сделайте тестовый звонок на номер агента (раздел «Агенты» → «Test call»). После завершения
                  звонок появится в разделе «Звонки», а аудио и транскрипция — на вашем гейтвее. Готово.
                </p>
                <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm flex items-start gap-2">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <div>
                    Конфигурация сохранена. Все новые звонки будут уходить только на ваш гейтвей.
                    На стороне Lunara сохраняются только ID звонков и технический статус.
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setWizard(false)}>Готово</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-gradient-card shadow-soft mb-5">
        <CardContent className="p-5 space-y-5">
          <div>
            <Label className="mb-2 block">Storage mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cloud"><div className="flex items-center gap-2"><Cloud className="h-4 w-4" /> Lunara cloud (default)</div></SelectItem>
                <SelectItem value="self_hosted"><div className="flex items-center gap-2"><Server className="h-4 w-4" /> Self-hosted Client Data Gateway</div></SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              In <b>cloud</b> mode, audio and transcripts live in Lunara Storage. In <b>self-hosted</b> mode, we keep only call IDs and technical status — audio and text are forwarded to your gateway and never stored on our side.
            </p>
          </div>

          {mode === "self_hosted" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enabled</Label>
                  <p className="text-xs text-muted-foreground">When off, new calls fall back to cloud storage.</p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div>
                <Label htmlFor="gw">Gateway URL</Label>
                <Input id="gw" placeholder="https://gateway.client.internal" value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} />
              </div>

              <div>
                <Label htmlFor="sec">HMAC shared secret</Label>
                <div className="flex gap-2">
                  <Input id="sec" type="password" placeholder="≥ 16 chars" value={secret} onChange={(e) => setSecret(e.target.value)} />
                  <Button variant="outline" type="button" onClick={() => setSecret(genHmacSecret())} title="Generate"><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-4">
                  <Label>Purge recordings from Twilio after ingest</Label>
                  <p className="text-xs text-muted-foreground mt-1">Once your gateway confirms it has the file, Lunara sends Twilio a DELETE so no audio remains on the carrier side (zero-retention).</p>
                </div>
                <Switch checked={purgeTwilio} onCheckedChange={setPurgeTwilio} />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-4">
                  <Label>Proxy audio through Lunara (VPN-friendly)</Label>
                  <p className="text-xs text-muted-foreground mt-1">Enable if your gateway is only reachable from our servers. Browser will stream audio through Lunara.</p>
                </div>
                <Switch checked={proxyAudio} onCheckedChange={setProxyAudio} />
              </div>

              <div className="rounded-lg border p-3 text-xs flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  Signed headers sent on every call:
                  <code className="block mt-1">x-lunara-owner, x-lunara-timestamp, x-lunara-signature</code>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
            </Button>
            {mode === "self_hosted" && enabled && (
              <>
                <Button variant="outline" onClick={onPing} disabled={pinging}>
                  {pinging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                  Test connection
                </Button>
                <Button variant="outline" onClick={runHealth} disabled={hcLoading}>
                  {hcLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Heart className="h-4 w-4 mr-2" />}
                  Health dashboard
                </Button>
              </>
            )}
          </div>

          {lastPing.at && (
            <div className="text-xs flex items-center gap-2">
              Last check: {new Date(lastPing.at).toLocaleString()} ·{" "}
              <Badge variant={lastPing.ok ? "default" : "destructive"}>{lastPing.ok ? "OK" : "Failed"}</Badge>
              {lastPing.error && <span className="text-muted-foreground">{lastPing.error}</span>}
            </div>
          )}

          {hc && <HealthBlock hc={hc} />}
        </CardContent>
      </Card>

      <Card className="bg-gradient-card shadow-soft">
        <CardContent className="p-5 space-y-2 text-sm">
          <h3 className="font-display text-lg font-semibold">Reference gateway (Docker all-in-one)</h3>
          <p className="text-muted-foreground">
            В репозитории <code>client-data-gateway/</code> лежит готовый Docker Compose: <b>gateway + PostgreSQL + MinIO</b>,
            опциональные профили <b>whisper</b> (faster-whisper для локальной транскрипции) и <b>ollama</b> (локальный LLM
            для саммари). Один <code>docker compose --profile whisper --profile ollama up -d</code> — и заказчик работает on-prem,
            аудио и тексты не уходят в облако.
          </p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1">
            <li><b>POST /calls/ingest</b> — приём звонка от Lunara, загрузка mp3, локальная транскрипция.</li>
            <li><b>GET /calls/:id</b> / <b>/audio</b> — выдача транскрипта и аудио из MinIO (server-side AES-256).</li>
            <li><b>GET /audit/log</b> — подписанный hash-chain журнал доступа (для регулятора).</li>
            <li><b>GET /health</b>, <b>/ready</b> — пробы для health dashboard выше.</li>
            <li><b>RETENTION_DAYS</b> — авто-удаление аудио и БД согласно ФЗ-152 / GDPR.</li>
          </ul>
          <p className="text-xs text-muted-foreground pt-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-warning shrink-0" />
            SSO (LDAP/AD/Keycloak/SAML) и RBAC (operator / supervisor / auditor / admin) подключаются через
            Supabase Auth → SAML SSO в настройках workspace, либо через прокси-gateway вашего IdP.
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
