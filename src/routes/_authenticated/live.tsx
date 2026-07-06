import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Radio, AlertTriangle, Sparkles, Headphones, Send, PhoneOff, ArrowRightLeft,
  Activity, ShieldAlert, MessageSquare, ShieldCheck, Check,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ComplianceRulesSheet } from "@/components/live/ComplianceRulesSheet";

type ComplianceViolation = { rule_id: string; rule_text: string; correction: string | null };
type MissingRequired = { rule_id: string; rule_text: string };


export const Route = createFileRoute("/_authenticated/live")({ component: LivePage });

type Risk = "green" | "amber" | "red";
type Kind = "call" | "copilot_session";

type LiveItem = {
  id: string;
  kind: Kind;
  source: "ai" | "human";
  agent_name: string | null;
  customer: string | null;
  started_at: string | null;
  risk_updated_at: string | null;
  risk_level: Risk;
  risk_score: number;
  risk_reason: string | null;
  primary_signal: string | null;
  suggested_action: string | null;
  sentiment: string | null;
};

type RawCall = {
  id: string;
  source: "ai" | "human" | null;
  from_number: string | null;
  to_number: string | null;
  direction: string | null;
  started_at: string | null;
  ended_at: string | null;
  risk_updated_at: string | null;
  risk_level: Risk | null;
  risk_score: number | null;
  risk_reason: string | null;
  primary_signal: string | null;
  suggested_action: string | null;
  sentiment: string | null;
  agents?: { name: string | null } | null;
};

type RawCopilot = {
  id: string;
  source: "ai" | "human" | null;
  manager_name: string | null;
  customer_phone: string | null;
  started_at: string | null;
  ended_at: string | null;
  risk_updated_at: string | null;
  risk_level: Risk | null;
  risk_score: number | null;
  risk_reason: string | null;
  primary_signal: string | null;
  suggested_action: string | null;
  sentiment: string | null;
  copilot_agents?: { name: string | null } | null;
};

// Hide cards whose row has gone stale (no transcript / no analyzer update
// for STALE_MS). Protects against bridges that crashed without writing
// ended_at — the card would otherwise hang in the grid forever.
const STALE_MS = 10 * 60 * 1000;

const RISK_RANK: Record<Risk, number> = { red: 0, amber: 1, green: 2 };

function fmtDur(startedAt: string | null, now: number) {
  if (!startedAt) return "00:00";
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function LivePage() {
  const { t } = useI18n();
  const [items, setItems] = useState<LiveItem[]>([]);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState<LiveItem | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);


  useEffect(() => {
    const tk = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tk);
  }, []);

  const load = async () => {
    const [{ data: c }, { data: cs }] = await Promise.all([
      supabase.from("calls")
        .select("id,source,from_number,to_number,direction,started_at,ended_at,risk_updated_at,risk_level,risk_score,risk_reason,primary_signal,suggested_action,sentiment,agents(name)")
        .is("ended_at", null)
        .in("status", ["queued", "ringing", "in_progress"])
        .order("started_at", { ascending: false }).limit(50),
      supabase.from("copilot_sessions")
        .select("id,source,manager_name,customer_phone,started_at,ended_at,risk_updated_at,risk_level,risk_score,risk_reason,primary_signal,suggested_action,sentiment,copilot_agents(name)")
        .is("ended_at", null).eq("status", "active")
        .order("started_at", { ascending: false }).limit(50),
    ]);
    const calls: LiveItem[] = ((c ?? []) as unknown as RawCall[]).map((r) => ({
      id: r.id, kind: "call",
      source: (r.source ?? "ai") as "ai" | "human",
      agent_name: r.agents?.name ?? "AI Agent",
      customer: r.direction === "inbound" ? r.from_number : r.to_number,
      started_at: r.started_at,
      risk_updated_at: r.risk_updated_at,
      risk_level: (r.risk_level ?? "green") as Risk,
      risk_score: r.risk_score ?? 0,
      risk_reason: r.risk_reason, primary_signal: r.primary_signal,
      suggested_action: r.suggested_action, sentiment: r.sentiment,
    }));
    const sessions: LiveItem[] = ((cs ?? []) as unknown as RawCopilot[]).map((r) => ({
      id: r.id, kind: "copilot_session",
      source: (r.source ?? "human") as "ai" | "human",
      agent_name: r.manager_name || r.copilot_agents?.name || "Manager",
      customer: r.customer_phone,
      started_at: r.started_at,
      risk_updated_at: r.risk_updated_at,
      risk_level: (r.risk_level ?? "green") as Risk,
      risk_score: r.risk_score ?? 0,
      risk_reason: r.risk_reason, primary_signal: r.primary_signal,
      suggested_action: r.suggested_action, sentiment: r.sentiment,
    }));
    setItems([...calls, ...sessions]);
  };

  useEffect(() => {
    void load();
    const ch = supabase.channel("live-supervisor")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "copilot_sessions" }, () => void load())
      .subscribe();
    const poll = setInterval(load, 8000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, []);

  // Sort by risk, then by score. Filter zombie cards whose row hasn't been
  // touched (no transcript / no analyzer update) for STALE_MS.
  const sorted = useMemo(() => {
    const cutoff = now - STALE_MS;
    return [...items]
      .filter((i) => {
        const lastSeen = Math.max(
          i.risk_updated_at ? new Date(i.risk_updated_at).getTime() : 0,
          i.started_at ? new Date(i.started_at).getTime() : 0,
        );
        return lastSeen >= cutoff;
      })
      .sort((a, b) => {
        const r = RISK_RANK[a.risk_level] - RISK_RANK[b.risk_level];
        if (r !== 0) return r;
        return b.risk_score - a.risk_score;
      });
  }, [items, now]);

  const redCount = sorted.filter((i) => i.risk_level === "red").length;
  const amberCount = sorted.filter((i) => i.risk_level === "amber").length;
  const topAlert = sorted.find((i) => i.risk_level === "red") || sorted.find((i) => i.risk_level === "amber");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("live.title")} description={t("live.subtitle")} />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <span className="text-muted-foreground">{t("live.realtime")}</span>
        </div>
        <Badge variant="secondary" className="gap-1"><Activity className="h-3 w-3" /> {sorted.length} live</Badge>
        {redCount > 0 && <Badge className="gap-1 bg-red-500/15 text-red-400 border border-red-500/30"><ShieldAlert className="h-3 w-3" /> {redCount} red</Badge>}
        {amberCount > 0 && <Badge className="gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/30"><AlertTriangle className="h-3 w-3" /> {amberCount} amber</Badge>}
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={() => setRulesOpen(true)} className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Rules
          </Button>
        </div>
      </div>


      {topAlert?.risk_reason && (
        <Card className={cn(
          "mb-5 border",
          topAlert.risk_level === "red"
            ? "bg-red-500/10 border-red-500/40 shadow-[0_0_24px_-8px_hsl(0_85%_55%/0.4)]"
            : "bg-amber-500/10 border-amber-500/40"
        )}>
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <AlertTriangle className={cn("h-5 w-5 mt-0.5 shrink-0", topAlert.risk_level === "red" ? "text-red-400" : "text-amber-400")} />
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Supervisor alert · {topAlert.agent_name}</div>
              <div className={cn("font-medium", topAlert.risk_level === "red" && "font-semibold")}>{topAlert.risk_reason}</div>
              {topAlert.suggested_action && (
                <div className="text-xs text-muted-foreground mt-0.5">→ {topAlert.suggested_action}</div>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => setOpen(topAlert)}>Open</Button>
          </CardContent>
        </Card>
      )}

      {sorted.length === 0 ? (
        <Card className="bg-gradient-card border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Radio className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-display text-xl font-semibold mb-2">{t("live.empty.title")}</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">{t("live.empty.body")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((c) => <CallCard key={`${c.kind}:${c.id}`} item={c} now={now} onOpen={() => setOpen(c)} />)}
        </div>
      )}

      <LiveTicketsWidget />

      <CallDrawer item={open} onClose={() => setOpen(null)} />
      <ComplianceRulesSheet open={rulesOpen} onOpenChange={setRulesOpen} />


    </div>
  );
}

type TicketRowLive = {
  id: string; created_at: string; status: string; attempts: number;
  emergency_type: string | null; facility_address: string | null;
  external_ticket_id: string | null; last_error: string | null;
  call_sid: string | null;
};

function LiveTicketsWidget() {
  const [rows, setRows] = useState<TicketRowLive[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("tickets" as never)
        .select("id, created_at, status, attempts, emergency_type, facility_address, external_ticket_id, last_error, call_sid")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cancelled) {
        setRows((data ?? []) as unknown as TicketRowLive[]);
        setLoading(false);
      }
    };
    void load();
    const ch = supabase
      .channel("live:tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => void load())
      .subscribe();
    const poll = setInterval(load, 10_000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, []);

  const badgeCls = (s: string) =>
    s === "success" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : s === "escalated" ? "bg-red-500/15 text-red-400 border-red-500/30"
    : s === "failed" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
    : "bg-muted text-muted-foreground border-border";

  return (
    <Card className="mt-6 bg-gradient-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="font-medium text-sm">Live tickets (CRM #2)</h3>
          </div>
          <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Пока нет заявок из голосовых звонков.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs rounded-md border border-border/40 px-2 py-1.5">
                <Badge className={cn("h-5 px-1.5 text-[10px] border", badgeCls(t.status))}>{t.status}</Badge>
                <span className="tabular-nums text-muted-foreground">#{t.attempts}</span>
                <span className="truncate flex-1">
                  {t.emergency_type ?? "—"} · {t.facility_address ?? "—"}
                </span>
                {t.external_ticket_id && (
                  <code className="font-mono text-[10px] text-muted-foreground">{t.external_ticket_id}</code>
                )}
                {t.last_error && t.status !== "success" && (
                  <span className="text-red-400 truncate max-w-[200px]" title={t.last_error}>{t.last_error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CallCard({ item, now, onOpen }: { item: LiveItem; now: number; onOpen: () => void }) {
  const r = item.risk_level;
  const accent =
    r === "red" ? "border-red-500/50 shadow-[0_0_18px_-6px_hsl(0_85%_55%/0.45)]"
    : r === "amber" ? "border-amber-500/40"
    : "border-border";
  const bar = r === "red" ? "bg-red-500" : r === "amber" ? "bg-amber-500" : "bg-muted-foreground/20";

  return (
    <Card className={cn("relative overflow-hidden bg-gradient-card border transition-all", accent)}>
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", bar)} />
      <CardContent className="p-4 pl-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-medium truncate">{item.agent_name}</span>
              {item.source === "ai"
                ? <Badge className="h-5 px-1.5 text-[10px] bg-primary/20 text-primary-glow border-primary/30"><Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI</Badge>
                : <Badge variant="outline" className="h-5 px-1.5 text-[10px]"><Headphones className="h-2.5 w-2.5 mr-0.5" /> Copilot</Badge>}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="truncate">{item.customer || "—"}</span>
              <span className="tabular-nums">· {fmtDur(item.started_at, now)}</span>
              {item.sentiment && (
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px]",
                  item.sentiment === "negative" ? "bg-red-500/15 text-red-400"
                  : item.sentiment === "positive" ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-muted text-muted-foreground"
                )}>{item.sentiment}</span>
              )}
            </div>
          </div>
        </div>

        {(r === "red" || r === "amber") && item.risk_reason && (
          <div className={cn(
            "mt-2 flex items-start gap-1.5 text-xs rounded-md px-2 py-1.5 border",
            r === "red"
              ? "bg-red-500/10 border-red-500/30 text-red-300 font-semibold"
              : "bg-amber-500/10 border-amber-500/30 text-amber-300"
          )}>
            {item.primary_signal === "compliance_risk"
              ? <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              {item.primary_signal === "compliance_risk" && (
                <Badge className="mr-1.5 h-4 px-1.5 text-[9px] uppercase tracking-wider bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 align-middle">
                  Compliance
                </Badge>
              )}
              <span>{item.risk_reason}</span>
            </div>
          </div>
        )}


        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="secondary" className="h-7" onClick={onOpen}>Open</Button>
          {item.source === "human" && (
            <Button size="sm" variant="outline" className="h-7" onClick={onOpen}>
              <MessageSquare className="h-3.5 w-3.5 mr-1" /> Whisper
            </Button>
          )}
          {item.source === "ai" && item.primary_signal === "handoff_needed" && (
            <Button size="sm" className="h-7 bg-red-500 hover:bg-red-600 text-white" onClick={onOpen}>
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Take over
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type TranscriptLine = { who: string; text: string; ts: string };

type SentWhisper = { id: string; text: string; created_at: string; read_at: string | null };

function CallDrawer({ item, onClose }: { item: LiveItem | null; onClose: () => void }) {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [whisper, setWhisper] = useState("");
  const [sending, setSending] = useState(false);
  const [sentWhispers, setSentWhispers] = useState<SentWhisper[]>([]);
  const [violations, setViolations] = useState<ComplianceViolation[]>([]);
  const [missing, setMissing] = useState<MissingRequired[]>([]);
  const [mustSayRules, setMustSayRules] = useState<{ id: string; text: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);


  useEffect(() => {
    if (!item) { setLines([]); setSentWhispers([]); setViolations([]); setMissing([]); setMustSayRules([]); return; }
    let cancelled = false;

    const fetchTx = async () => {
      if (item.kind === "call") {
        const { data } = await supabase.from("calls").select("transcript").eq("id", item.id).maybeSingle();
        const arr = ((data?.transcript as Array<{ role: string; text: string; ts?: string }> | null) ?? [])
          .map((m) => ({ who: m.role, text: m.text, ts: m.ts ?? "" }));
        if (!cancelled) setLines(arr);
      } else {
        const { data } = await supabase.from("copilot_transcript")
          .select("speaker,text,ts").eq("session_id", item.id).order("ts", { ascending: true });
        const arr = (data ?? []).map((r) => ({ who: r.speaker, text: r.text, ts: r.ts }));
        if (!cancelled) setLines(arr);
      }
    };
    const fetchWhispers = async () => {
      const { data } = await supabase.from("whispers")
        .select("id,text,created_at,read_at")
        .eq("call_id", item.id).eq("call_kind", item.kind)
        .order("created_at", { ascending: false }).limit(8);
      if (!cancelled) setSentWhispers((data ?? []) as SentWhisper[]);
    };
    const fetchCompliance = async () => {
      const { data: ev } = await supabase.from("call_analysis_events")
        .select("signals")
        .eq("call_id", item.id).eq("call_kind", item.kind)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const sig = (ev?.signals ?? {}) as { compliance_violations?: ComplianceViolation[]; missing_required?: MissingRequired[] };
      if (!cancelled) {
        setViolations(Array.isArray(sig.compliance_violations) ? sig.compliance_violations : []);
        setMissing(Array.isArray(sig.missing_required) ? sig.missing_required : []);
      }
      const { data: rules } = await supabase.from("compliance_rules")
        .select("id,text").eq("kind", "must_say").eq("active", true);
      if (!cancelled) setMustSayRules(((rules ?? []) as unknown) as { id: string; text: string }[]);
    };
    void fetchTx();
    void fetchWhispers();
    void fetchCompliance();
    const channels = [
      supabase.channel(`drawer-${item.kind}-${item.id}`)
        .on("postgres_changes",
          item.kind === "call"
            ? { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${item.id}` }
            : { event: "INSERT", schema: "public", table: "copilot_transcript", filter: `session_id=eq.${item.id}` },
          () => void fetchTx())
        .on("postgres_changes",
          { event: "*", schema: "public", table: "whispers", filter: `call_id=eq.${item.id}` },
          () => void fetchWhispers())
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "call_analysis_events", filter: `call_id=eq.${item.id}` },
          () => void fetchCompliance())
        .subscribe(),
    ];

    return () => { cancelled = true; channels.forEach((c) => supabase.removeChannel(c)); };
  }, [item]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const sendWhisper = async () => {
    if (!item || !whisper.trim()) return;
    setSending(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("whispers").insert({
      owner_id: u.user!.id, sender_id: u.user!.id,
      call_id: item.id, call_kind: item.kind, text: whisper.trim(),
    });
    setSending(false);
    if (error) { toast.error("Whisper failed"); return; }
    setWhisper(""); toast.success("Whisper sent to manager");
  };

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            {item?.source === "ai"
              ? <Badge className="bg-primary/20 text-primary-glow border-primary/30"><Sparkles className="h-3 w-3 mr-1" /> AI</Badge>
              : <Badge variant="outline"><Headphones className="h-3 w-3 mr-1" /> Copilot</Badge>}
            <span className="truncate">{item?.agent_name}</span>
          </SheetTitle>
          <div className="text-xs text-muted-foreground">{item?.customer}</div>
        </SheetHeader>

        {item && (item.risk_level !== "green") && (
          <div className={cn(
            "mx-5 mt-3 rounded-lg border px-3 py-2 text-sm",
            item.risk_level === "red" ? "bg-red-500/10 border-red-500/30 text-red-200" : "bg-amber-500/10 border-amber-500/30 text-amber-200"
          )}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">{item.risk_reason}</div>
                {item.suggested_action && <div className="text-xs opacity-80 mt-0.5">→ {item.suggested_action}</div>}
              </div>
            </div>
          </div>
        )}

        {(violations.length > 0 || mustSayRules.length > 0) && (
          <div className="mx-5 mt-3 rounded-lg border border-border bg-card/40 px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Compliance
            </div>
            {violations.length > 0 && (
              <div className="space-y-1.5">
                {violations.map((v) => (
                  <div key={v.rule_id} className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs">
                    <div className="text-red-300 font-medium">⚠ {v.rule_text}</div>
                    {v.correction && <div className="text-red-200/80 mt-0.5">Say instead: {v.correction}</div>}
                  </div>
                ))}
              </div>
            )}
            {mustSayRules.length > 0 && (
              <ul className="space-y-1">
                {mustSayRules.map((r) => {
                  const pending = missing.some((m) => m.rule_id === r.id);
                  return (
                    <li key={r.id} className="flex items-start gap-2 text-xs">
                      {pending
                        ? <span className="mt-0.5 h-3.5 w-3.5 rounded-full border border-amber-500/50 shrink-0" />
                        : <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-400 shrink-0" />}
                      <span className={cn(pending ? "text-amber-300" : "text-muted-foreground line-through")}>{r.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}



        <ScrollArea className="flex-1 px-5 py-3" ref={scrollRef as never}>
          <div className="space-y-2">
            {lines.length === 0 && <div className="text-xs text-muted-foreground">Waiting for transcript…</div>}
            {lines.map((l, i) => (
              <div key={i} className="text-sm">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-2">{l.who}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </ScrollArea>

        {item?.source === "human" ? (
          <div className="border-t border-border p-3 space-y-2">
            {sentWhispers.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-auto">
                {sentWhispers.map((w) => (
                  <div key={w.id} className="text-xs flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1">
                    <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{w.text}</span>
                    <span className={cn(
                      "text-[10px] shrink-0",
                      w.read_at ? "text-emerald-400" : "text-muted-foreground"
                    )}>
                      {w.read_at ? "✓ доставлено" : "отправлено"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Whisper to manager…"
                value={whisper}
                onChange={(e) => setWhisper(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendWhisper()}
                disabled={sending}
              />
              <Button onClick={sendWhisper} disabled={sending || !whisper.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : item?.primary_signal === "handoff_needed" ? (
          <div className="border-t border-border p-3 flex gap-2">
            <Button className="w-full bg-red-500 hover:bg-red-600 text-white">
              <ArrowRightLeft className="h-4 w-4 mr-2" /> Take over from AI
            </Button>
            <Button variant="outline" size="icon"><PhoneOff className="h-4 w-4" /></Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
