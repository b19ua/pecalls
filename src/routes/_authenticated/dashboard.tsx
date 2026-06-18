import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { HintIcon } from "@/components/HintIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PhoneCall, PhoneIncoming, PhoneOutgoing, Clock, Coins, Bot,
  Plus, Upload, Sparkles, CheckCircle2, ArrowRight, Lightbulb, Activity,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { UserBanner } from "@/components/UserBanner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type Stats = {
  totalCalls: number;
  inbound: number;
  outbound: number;
  totalMinutes: number;
  totalTokens: number;
  totalAgents: number;
};

type RecentCall = {
  id: string;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  status: string;
  duration_seconds: number;
  created_at: string;
};

function DashboardPage() {
  const { t, lang } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentCall[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: calls }, { count: agentCount }, { data: rec }] = await Promise.all([
        supabase.from("calls").select("direction,duration_seconds,input_tokens,output_tokens"),
        supabase.from("agents").select("*", { count: "exact", head: true }),
        supabase.from("calls")
          .select("id,direction,from_number,to_number,status,duration_seconds,created_at")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      const list = calls ?? [];
      setStats({
        totalCalls: list.length,
        inbound: list.filter((c) => c.direction === "inbound").length,
        outbound: list.filter((c) => c.direction === "outbound").length,
        totalMinutes: Math.round(list.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60),
        totalTokens: list.reduce((s, c) => s + (c.input_tokens ?? 0) + (c.output_tokens ?? 0), 0),
        totalAgents: agentCount ?? 0,
      });
      setRecent((rec ?? []) as RecentCall[]);
    })();
  }, []);

  const localeMap = { ru: "ru-RU", ro: "ro-RO", en: "en-US" } as const;
  const fmtNum = (n: number | undefined) =>
    n === undefined ? "—" : n.toLocaleString(localeMap[lang]);

  const cards = [
    { label: t("dash.kpi.totalCalls"), value: fmtNum(stats?.totalCalls), icon: PhoneCall, color: "text-primary", hint: t("dash.kpi.totalCalls.hint") },
    { label: t("dash.kpi.inbound"),    value: fmtNum(stats?.inbound),    icon: PhoneIncoming, color: "text-success", hint: t("dash.kpi.inbound.hint") },
    { label: t("dash.kpi.outbound"),   value: fmtNum(stats?.outbound),   icon: PhoneOutgoing, color: "text-primary-glow", hint: t("dash.kpi.outbound.hint") },
    { label: t("dash.kpi.minutes"),    value: fmtNum(stats?.totalMinutes), icon: Clock, color: "text-warning", hint: t("dash.kpi.minutes.hint") },
    { label: t("dash.kpi.tokens"),     value: fmtNum(stats?.totalTokens),  icon: Coins, color: "text-primary", hint: t("dash.kpi.tokens.hint") },
    { label: t("dash.kpi.agents"),     value: fmtNum(stats?.totalAgents),  icon: Bot, color: "text-success", hint: t("dash.kpi.agents.hint") },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("dash.title")} description={t("dash.subtitle")} />

      {/* Tip banner */}
      <div className="mb-6 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary-glow/10 to-transparent p-4 sm:p-5 flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Lightbulb className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm">{t("dash.tip.title")}</div>
          <div className="text-sm text-muted-foreground mt-0.5">{t("dash.tip.body")}</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {cards.map((c) => (
          <Card key={c.label} className="bg-gradient-card shadow-soft border-border/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                {c.label}
                <HintIcon text={c.hint} />
              </CardTitle>
              <c.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${c.color}`} />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="font-display text-2xl sm:text-3xl font-bold tracking-tight">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two-column: actions + status */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2 bg-gradient-card shadow-soft">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> {t("dash.actions")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            <ActionCard to="/agents/$agentId" params={{ agentId: "new" }} icon={Plus} label={t("dash.action.newAgent")} />
            <ActionCard to="/agents" icon={Bot} label={t("dash.action.testCall")} />
            <ActionCard to="/knowledge" icon={Upload} label={t("dash.action.uploadKb")} />
            <ActionCard to="/numbers" icon={PhoneOutgoing} label={t("dash.action.makeCall")} />
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-soft">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-success" /> {t("dash.health")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <HealthRow label={t("dash.health.gemini")} detail={t("dash.health.gemini.detail")} />
            <HealthRow label={t("dash.health.twilio")} detail={t("dash.health.twilio.detail")} />
            <HealthRow label={t("dash.health.bridge")} detail={t("dash.health.bridge.detail")} />
          </CardContent>
        </Card>
      </div>

      {/* Recent + Quick start */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-gradient-card shadow-soft">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-primary" /> {t("dash.recent")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("dash.recent.empty")}</div>
            ) : (
              <div className="space-y-2">
                {recent.map((c) => (
                  <Link key={c.id} to="/calls/$callId" params={{ callId: c.id }}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {c.direction === "inbound"
                        ? <PhoneIncoming className="h-4 w-4 text-success" />
                        : <PhoneOutgoing className="h-4 w-4 text-primary-glow" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {c.direction === "inbound" ? c.from_number : c.to_number}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString(localeMap[lang])} · {c.duration_seconds}s
                      </div>
                    </div>
                    <Badge variant={c.status === "completed" ? "default" : c.status === "failed" ? "destructive" : "secondary"}>
                      {c.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">{t("dash.quickStart")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2.5">
            <Step n={1}>{t("dash.qs.1")}</Step>
            <Step n={2}>{t("dash.qs.2")}</Step>
            <Step n={3}>{t("dash.qs.3")}</Step>
            <Step n={4}>{t("dash.qs.4")}</Step>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActionCard({ to, params, icon: Icon, label }: { to: any; params?: any; icon: any; label: string }) {
  return (
    <Button asChild variant="outline" className="h-auto justify-between p-4 text-left">
      <Link to={to} params={params}>
        <span className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </span>
          <span className="font-medium text-sm">{label}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </Button>
  );
}

function HealthRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-background/50">
      <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      <span>{children}</span>
    </div>
  );
}
