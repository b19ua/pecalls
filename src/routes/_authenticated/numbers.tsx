import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { syncTwilioNumbers, configureTwilioNumber, placeOutboundCall } from "@/lib/twilio.functions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Phone, RefreshCw, Loader2, PhoneOutgoing, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/numbers")({ component: NumbersPage });

type Num = {
  id: string;
  phone_e164: string;
  friendly_name: string | null;
  agent_id: string | null;
  voice_webhook_url: string | null;
};

function NumbersPage() {
  const { t } = useI18n();
  const [numbers, setNumbers] = useState<Num[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const sync = useServerFn(syncTwilioNumbers);
  const configure = useServerFn(configureTwilioNumber);
  const outbound = useServerFn(placeOutboundCall);

  async function refresh() {
    const [{ data: nums }, { data: ag }] = await Promise.all([
      supabase.from("twilio_numbers").select("id,phone_e164,friendly_name,agent_id,voice_webhook_url").order("phone_e164"),
      supabase.from("agents").select("id,name").order("name"),
    ]);
    setNumbers(nums ?? []);
    setAgents(ag ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await sync({});
      toast.success(`OK: ${r.synced}`);
      await refresh();
    } catch (e: any) { toast.error(e.message); } finally { setSyncing(false); }
  }

  async function handleAssign(numberId: string, agentId: string | null) {
    try {
      await configure({ data: { numberId, agentId } });
      toast.success("Webhook OK");
      await refresh();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={t("numbers.title")}
        description={t("numbers.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <OutboundDialog agents={agents} onCall={async (agentId, to) => {
              try { const r = await outbound({ data: { agentId, toNumber: to } }); toast.success(`SID: ${r.sid}`); }
              catch (e: any) { toast.error(e.message); }
            }} />
            <Button onClick={handleSync} disabled={syncing} className="bg-gradient-primary shadow-elegant">
              {syncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              {t("numbers.sync")}
            </Button>
          </div>
        }
      />

      <div className="mb-5 rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-start gap-2.5 text-sm">
        <Lightbulb className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <span className="text-muted-foreground">{t("numbers.tip")}</span>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : numbers.length === 0 ? (
        <Card className="bg-gradient-card border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Phone className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-display text-xl font-semibold mb-2">{t("numbers.empty.title")}</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">{t("numbers.empty.body")}</p>
            <Button onClick={handleSync} disabled={syncing} className="bg-gradient-primary">
              <RefreshCw className="h-4 w-4 mr-1.5" /> {t("numbers.sync")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {numbers.map((n) => (
            <Card key={n.id} className="bg-gradient-card shadow-soft">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base sm:text-lg font-semibold">{n.phone_e164}</div>
                    <div className="text-xs text-muted-foreground truncate">{n.friendly_name || "—"}</div>
                    {n.voice_webhook_url && <div className="text-xs text-success mt-0.5">✓ {t("numbers.webhookActive")}</div>}
                  </div>
                </div>
                <div className="w-full sm:w-72">
                  <Label className="text-xs text-muted-foreground">{t("numbers.agent")}</Label>
                  <Select value={n.agent_id ?? "none"} onValueChange={(v) => handleAssign(n.id, v === "none" ? null : v)}>
                    <SelectTrigger><SelectValue placeholder={t("numbers.notBound")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("numbers.notBound")}</SelectItem>
                      {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OutboundDialog({ agents, onCall }: { agents: { id: string; name: string }[]; onCall: (agentId: string, to: string) => Promise<void> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><PhoneOutgoing className="h-4 w-4 mr-1.5" /> {t("numbers.outbound")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("numbers.dialog.title")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("numbers.agent")}</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder={t("numbers.agent")} /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("numbers.dialog.recipient")}</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+37360123456" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button
            disabled={!agentId || !to || busy}
            onClick={async () => { setBusy(true); await onCall(agentId, to); setBusy(false); setOpen(false); }}
            className="bg-gradient-primary"
          >
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PhoneOutgoing className="h-4 w-4 mr-1.5" />}
            {t("numbers.dialog.call")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
