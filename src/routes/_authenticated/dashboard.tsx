import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneCall, PhoneIncoming, PhoneOutgoing, Clock, Coins, Bot } from "lucide-react";

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

function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: calls }, { count: agentCount }] = await Promise.all([
        supabase.from("calls").select("direction,duration_seconds,input_tokens,output_tokens"),
        supabase.from("agents").select("*", { count: "exact", head: true }),
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
    })();
  }, []);

  const cards = [
    { label: "Всего звонков", value: stats?.totalCalls ?? "—", icon: PhoneCall, color: "text-primary" },
    { label: "Входящие",      value: stats?.inbound ?? "—",    icon: PhoneIncoming, color: "text-success" },
    { label: "Исходящие",     value: stats?.outbound ?? "—",   icon: PhoneOutgoing, color: "text-primary-glow" },
    { label: "Минуты",        value: stats?.totalMinutes ?? "—", icon: Clock, color: "text-warning" },
    { label: "Токены",        value: stats?.totalTokens?.toLocaleString() ?? "—", icon: Coins, color: "text-primary" },
    { label: "ИИ-агенты",     value: stats?.totalAgents ?? "—", icon: Bot, color: "text-success" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Дашборд" description="Обзор активности платформы ИИ-звонков." />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="bg-gradient-card shadow-soft border-border/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="font-display text-3xl font-bold tracking-tight">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8 bg-gradient-card shadow-soft border-border/60">
        <CardHeader>
          <CardTitle>Быстрый старт</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Создайте ИИ-агента в разделе <strong className="text-foreground">«ИИ-агенты»</strong> — задайте приветствие, голос Gemini, язык.</p>
          <p>2. Загрузите PDF/DOCX/TXT в <strong className="text-foreground">«База знаний»</strong> для RAG-ответов.</p>
          <p>3. Привяжите Twilio-номер для входящих и настройте до 5 номеров human handoff.</p>
          <p>4. Запускайте исходящие звонки вручную или через <strong className="text-foreground">«Кампании»</strong> с CSV-импортом.</p>
        </CardContent>
      </Card>
    </div>
  );
}
