import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Bot, Phone, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/agents/")({
  component: AgentsPage,
});

type Agent = {
  id: string;
  name: string;
  description: string | null;
  voice: string;
  language: string;
  twilio_number_e164: string | null;
  is_active: boolean;
};

function AgentsPage() {
  const { t } = useI18n();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("agents")
      .select("id,name,description,voice,language,twilio_number_e164,is_active")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAgents(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={t("agents.title")}
        description={t("agents.subtitle")}
        actions={
          <Button asChild className="bg-gradient-primary shadow-elegant">
            <Link to="/agents/$agentId" params={{ agentId: "new" }}>
              <Plus className="h-4 w-4 mr-1.5" /> {t("agents.new")}
            </Link>
          </Button>
        }
      />

      <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5 text-sm">
        <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <span className="text-muted-foreground">{t("agents.tip")}</span>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">{t("common.loading")}</div>
      ) : agents.length === 0 ? (
        <Card className="bg-gradient-card border-dashed border-2 border-border">
          <CardContent className="py-16 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">{t("agents.empty.title")}</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">{t("agents.empty.body")}</p>
            <Button asChild className="bg-gradient-primary shadow-elegant">
              <Link to="/agents/$agentId" params={{ agentId: "new" }}>
                <Plus className="h-4 w-4 mr-1.5" /> {t("agents.empty.cta")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <Link key={a.id} to="/agents/$agentId" params={{ agentId: a.id }}>
              <Card className="bg-gradient-card shadow-soft hover:shadow-elegant transition-shadow cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant={a.is_active ? "default" : "secondary"}>
                      {a.is_active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </div>
                  <h3 className="font-display text-lg font-semibold">{a.name}</h3>
                  {a.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 rounded bg-secondary">{a.voice}</span>
                    <span>{a.language}</span>
                  </div>
                  {a.twilio_number_e164 && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-foreground/80">
                      <Phone className="h-3 w-3" /> {a.twilio_number_e164}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}