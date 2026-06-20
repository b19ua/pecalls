import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Headphones, Plus, Radio, Bot, MessagesSquare, Settings2, Lightbulb } from "lucide-react";
import { listCopilotAgents, listCopilotSessions } from "@/lib/copilot.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/copilot/")({ component: CopilotHome });

type Agent = { id: string; name: string; enabled: boolean; description: string | null; suggestion_categories: string[] | null };
type Session = {
  id: string; agent_id: string; status: string; started_at: string; ended_at: string | null;
  customer_phone: string | null; manager_name: string | null; call_sid: string | null;
};

function CopilotHome() {
  const navigate = useNavigate();
  const fetchAgents = useServerFn(listCopilotAgents);
  const fetchSessions = useServerFn(listCopilotSessions);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const [a, s] = await Promise.all([
        fetchAgents({ data: undefined as never }),
        fetchSessions({ data: { status: "all" } }),
      ]);
      setAgents((a.agents ?? []) as Agent[]);
      setSessions((s.sessions ?? []) as Session[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    const ch = supabase
      .channel("copilot-sessions-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "copilot_sessions" }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const active = useMemo(() => sessions.filter((s) => s.status === "active"), [sessions]);
  const history = useMemo(() => sessions.filter((s) => s.status !== "active"), [sessions]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="AI Copilot Manager"
        description="ИИ-«третий слушатель» подсказывает менеджеру в реальном времени: возражения, эмоции, апсейл, следующий шаг."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/copilot/agents"><Settings2 className="h-4 w-4 mr-1" /> Агенты</Link>
            </Button>
            <Button onClick={() => navigate({ to: "/copilot/agents/new" })}>
              <Plus className="h-4 w-4 mr-1" /> Новый copilot
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="live" className="mt-4">
        <TabsList>
          <TabsTrigger value="live"><Radio className="h-4 w-4 mr-1.5" />Live ({active.length})</TabsTrigger>
          <TabsTrigger value="history"><MessagesSquare className="h-4 w-4 mr-1.5" />История</TabsTrigger>
          <TabsTrigger value="agents"><Bot className="h-4 w-4 mr-1.5" />Агенты ({agents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-4">
          {loading ? <SkeletonGrid /> : active.length === 0 ? (
            <EmptyState
              icon={<Radio className="h-10 w-10 text-muted-foreground" />}
              title="Сейчас нет активных звонков"
              body="Подключите менеджерский номер к copilot-агенту — каждый новый разговор будет анализироваться в реальном времени и подсказки появятся здесь."
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {active.map((s) => <SessionCard key={s.id} s={s} agents={agents} live />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare className="h-10 w-10 text-muted-foreground" />}
              title="История пуста"
              body="Здесь будут завершённые сессии с расшифровкой, подсказками и метриками."
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {history.map((s) => <SessionCard key={s.id} s={s} agents={agents} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          {agents.length === 0 ? (
            <EmptyState
              icon={<Headphones className="h-10 w-10 text-muted-foreground" />}
              title="Ещё нет copilot-агентов"
              body="Создайте первого — это конфигурация ИИ-наблюдателя: язык, фокус подсказок, контекст продукта."
              action={<Button onClick={() => navigate({ to: "/copilot/agents/new" })}><Plus className="h-4 w-4 mr-1" />Создать</Button>}
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {agents.map((a) => (
                <Link key={a.id} to="/copilot/agents/$agentId" params={{ agentId: a.id }}>
                  <Card className="bg-gradient-card hover:shadow-elegant transition-shadow cursor-pointer">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Headphones className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{a.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">{a.description || "—"}</div>
                        </div>
                        <Badge variant={a.enabled ? "default" : "secondary"}>{a.enabled ? "on" : "off"}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-3">
                        {(a.suggestion_categories ?? []).map((c) => (
                          <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionCard({ s, agents, live }: { s: Session; agents: Agent[]; live?: boolean }) {
  const agent = agents.find((a) => a.id === s.agent_id);
  return (
    <Link to="/copilot/sessions/$sessionId" params={{ sessionId: s.id }}>
      <Card className="bg-gradient-card hover:shadow-elegant transition-shadow cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Radio className={`h-5 w-5 ${live ? "text-success" : "text-muted-foreground"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{s.customer_phone || s.call_sid || "Без номера"}</div>
              <div className="text-xs text-muted-foreground">
                {agent?.name ?? "—"} · {s.manager_name ?? "—"} · {new Date(s.started_at).toLocaleString()}
              </div>
            </div>
            <Badge variant={live ? "default" : "secondary"}>{s.status}</Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <Card className="bg-gradient-card border-dashed border-2">
      <CardContent className="py-16 text-center">
        <div className="mx-auto mb-3 flex justify-center">{icon}</div>
        <h3 className="font-display text-xl font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">{body}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <Card key={i} className="bg-gradient-card animate-pulse h-24" />
      ))}
    </div>
  );
}
