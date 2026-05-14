import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, PhoneIncoming, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

type Call = {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  duration_seconds: number;
  created_at: string;
  handoff_at: string | null;
  from_number: string | null;
};

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))"];

function AnalyticsPage() {
  const { t, lang } = useI18n();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    supabase
      .from("calls")
      .select("id,direction,status,duration_seconds,created_at,handoff_at,from_number")
      .eq("direction", "inbound")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setCalls((data ?? []) as Call[]);
        setLoading(false);
      });
  }, []);

  const stats = useMemo(() => {
    const total = calls.length;
    const completed = calls.filter((c) => c.status === "completed").length;
    const failed = calls.filter((c) => c.status === "failed").length;
    const handoff = calls.filter((c) => c.handoff_at).length;
    const totalSec = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
    const avgSec = total ? Math.round(totalSec / total) : 0;
    const successRate = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, failed, handoff, totalSec, avgSec, successRate };
  }, [calls]);

  const byDay = useMemo(() => {
    const map = new Map<string, { date: string; count: number; minutes: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      map.set(d, { date: d.slice(5), count: 0, minutes: 0 });
    }
    for (const c of calls) {
      const d = c.created_at.slice(0, 10);
      const e = map.get(d);
      if (e) { e.count += 1; e.minutes += Math.round((c.duration_seconds ?? 0) / 60); }
    }
    return [...map.values()];
  }, [calls]);

  const byHour = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: 0 }));
    for (const c of calls) {
      const h = new Date(c.created_at).getHours();
      arr[h].count += 1;
    }
    return arr;
  }, [calls]);

  const byStatus = useMemo(() => ([
    { name: t("an.status.completed"), value: stats.completed },
    { name: t("an.status.handoff"), value: stats.handoff },
    { name: t("an.status.failed"), value: stats.failed },
  ].filter((s) => s.value > 0)), [stats, t]);

  const topCallers = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of calls) {
      const k = c.from_number || "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([num, count]) => ({ num, count }));
  }, [calls]);

  const exportCsv = () => {
    const header = ["created_at", "from", "status", "duration_seconds", "handoff_at"];
    const rows = calls.map((c) => [c.created_at, c.from_number ?? "", c.status, String(c.duration_seconds), c.handoff_at ?? ""]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inbound-calls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const localeMap = { ru: "ru-RU", ro: "ro-RO", en: "en-US" } as const;
  const fmt = (n: number) => n.toLocaleString(localeMap[lang]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <PageHeader title={t("an.title")} description={t("an.subtitle")} />
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!calls.length}>
          <Download className="h-4 w-4 mr-1.5" /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KPI icon={PhoneIncoming} label={t("an.kpi.inbound")} value={fmt(stats.total)} color="text-success" />
        <KPI icon={CheckCircle2} label={t("an.kpi.success")} value={`${stats.successRate}%`} color="text-primary" />
        <KPI icon={Clock} label={t("an.kpi.avg")} value={`${stats.avgSec}s`} color="text-warning" />
        <KPI icon={TrendingUp} label={t("an.kpi.handoff")} value={fmt(stats.handoff)} color="text-primary-glow" />
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : !calls.length ? (
        <Card className="bg-gradient-card border-dashed border-2">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">{t("an.empty")}</CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <ChartCard title={t("an.chart.byDay")}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("an.chart.minutes")}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Line type="monotone" dataKey="minutes" stroke="hsl(var(--primary-glow))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("an.chart.byHour")}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={2} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("an.chart.outcome")}>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={80} label>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card className="bg-gradient-card shadow-soft lg:col-span-2">
            <CardHeader><CardTitle className="text-base">{t("an.chart.topCallers")}</CardTitle></CardHeader>
            <CardContent>
              {topCallers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("an.empty")}</p>
              ) : (
                <div className="divide-y divide-border">
                  {topCallers.map((c) => (
                    <div key={c.num} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-mono">{c.num}</span>
                      <span className="text-muted-foreground">{c.count} {t("an.callsShort")}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <Card className="bg-gradient-card shadow-soft">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-display text-xl sm:text-2xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-gradient-card shadow-soft">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
