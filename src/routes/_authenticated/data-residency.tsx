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
import { Loader2, ShieldCheck, Server, Cloud, Activity } from "lucide-react";
import {
  getResidencyConfigFn,
  saveResidencyConfigFn,
  pingResidencyGatewayFn,
} from "@/lib/data-residency.functions";

export const Route = createFileRoute("/_authenticated/data-residency")({
  component: DataResidencyPage,
});

type Mode = "cloud" | "self_hosted";

function DataResidencyPage() {
  const get = useServerFn(getResidencyConfigFn);
  const save = useServerFn(saveResidencyConfigFn);
  const ping = useServerFn(pingResidencyGatewayFn);

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

  const onSave = async () => {
    if (mode === "self_hosted" && enabled) {
      if (!gatewayUrl.trim()) return toast.error("Gateway URL is required");
      if (secret.trim().length < 16) return toast.error("Secret must be ≥ 16 chars");
    }
    setSaving(true);
    try {
      await save({ data: {
        mode, enabled,
        gateway_url: gatewayUrl || null,
        hmac_secret: secret || null,
        purge_twilio_after_ingest: purgeTwilio,
        proxy_audio: proxyAudio,
      } });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
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

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <PageHeader
        title="Data residency"
        description="Choose where call recordings and transcripts are stored: in Lunara cloud or on your own Client Data Gateway."
      />

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
                <p className="text-xs text-muted-foreground mt-1">Must be reachable from Lunara's servers (public HTTPS, or a tunnel/VPN with a routable hostname).</p>
              </div>

              <div>
                <Label htmlFor="sec">HMAC shared secret</Label>
                <Input id="sec" type="password" placeholder="≥ 16 chars" value={secret} onChange={(e) => setSecret(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Used to sign every request with SHA-256 HMAC. Store the same value on the gateway side as <code>LUNARA_HMAC_SECRET</code>.</p>
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
              <Button variant="outline" onClick={onPing} disabled={pinging}>
                {pinging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                Test connection
              </Button>
            )}
          </div>

          {lastPing.at && (
            <div className="text-xs flex items-center gap-2">
              Last check: {new Date(lastPing.at).toLocaleString()} ·{" "}
              <Badge variant={lastPing.ok ? "default" : "destructive"}>{lastPing.ok ? "OK" : "Failed"}</Badge>
              {lastPing.error && <span className="text-muted-foreground">{lastPing.error}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gradient-card shadow-soft">
        <CardContent className="p-5 space-y-2 text-sm">
          <h3 className="font-display text-lg font-semibold">Reference gateway</h3>
          <p className="text-muted-foreground">
            A turn-key implementation (Node + PostgreSQL + MinIO + Whisper/Gemini, Docker Compose) lives under <code>client-data-gateway/</code> in the project repo. The client deploys it in their network, sets <code>LUNARA_HMAC_SECRET</code>, and exposes the URL — no additional changes on our side.
          </p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1">
            <li><b>POST /calls/ingest</b> — receives Twilio recording handoff, pulls audio, transcribes, stores locally.</li>
            <li><b>GET /calls/:id</b> — returns transcript, summary, audio URL.</li>
            <li><b>GET /calls/:id/audio-url</b> — returns a short-lived signed URL to MP3.</li>
            <li><b>GET /health</b> — liveness check used by the "Test connection" button.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
