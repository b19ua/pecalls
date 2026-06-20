import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Headphones } from "lucide-react";
import { listCopilotAgents } from "@/lib/copilot.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/copilot/agents/")({ component: Page });

type Agent = { id: string; name: string; description: string | null; enabled: boolean; language: string; suggestion_categories: string[] | null };

function Page() {
  const fetchAgents = useServerFn(listCopilotAgents);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    fetchAgents({ data: undefined as never })
      .then((r) => setAgents((r.agents ?? []) as Agent[]))
      .catch((e) => toast.error((e as Error).message));
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Copilot-агенты"
        description="Конфигурации ИИ-наблюдателя для звонков менеджеров."
        actions={
          <Button asChild>
            <Link to="/copilot/agents/$agentId" params={{ agentId: "new" }}>
              <Plus className="h-4 w-4 mr-1" /> Новый агент
            </Link>
          </Button>
        }
      />

      {agents.length === 0 ? (
        <Card className="bg-gradient-card border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Headphones className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-display text-xl font-semibold mb-2">Пока нет агентов</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Создайте первого copilot-агента и привяжите к нему звонки менеджера.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {agents.map((a) => (
            <Link key={a.id} to="/copilot/agents/$agentId" params={{ agentId: a.id }}>
              <Card className="bg-gradient-card hover:shadow-elegant transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
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
                    <Badge variant="outline" className="text-[10px]">{a.language}</Badge>
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
    </div>
  );
}
