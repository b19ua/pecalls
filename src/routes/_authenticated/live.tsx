import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhoneIncoming, PhoneOutgoing, Radio, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/live")({ component: LivePage });

type LiveCall = {
  id: string;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  status: string;
  started_at: string | null;
  created_at: string;
  transcript: { role: string; text: string }[] | null;
};

function LivePage() {
  const { t, lang } = useI18n();
  const [active, setActive] = useState<LiveCall[]>([]);
  const localeMap = { ru: "ru-RU", ro: "ro-RO", en: "en-US" } as const;

  const refresh = async () => {
    const { data } = await supabase
      .from("calls")
      .select("id,direction,from_number,to_number,status,started_at,created_at,transcript")
      .in("status", ["queued", "ringing", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(20);
    setActive((data ?? []) as LiveCall[]);
  };

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("calls-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => refresh())
      .subscribe();
    const tick = setInterval(refresh, 3000);
    return () => { supabase.removeChannel(channel); clearInterval(tick); };
  }, []);

  const elapsed = (iso: string | null) => {
    if (!iso) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader title={t("live.title")} description={t("live.subtitle")} />

      <div className="mb-6 flex items-center gap-2 text-sm">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
        </span>
        <span className="text-muted-foreground">{t("live.realtime")}</span>
        <Badge variant="secondary" className="ml-2">{active.length}</Badge>
      </div>

      {active.length === 0 ? (
        <Card className="bg-gradient-card border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Radio className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-display text-xl font-semibold mb-2">{t("live.empty.title")}</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">{t("live.empty.body")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {active.map((c) => {
            const last = (c.transcript ?? []).slice(-3);
            return (
              <Link key={c.id} to="/calls/$callId" params={{ callId: c.id }}>
                <Card className="bg-gradient-card shadow-soft hover:shadow-elegant transition-shadow cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        {c.direction === "inbound"
                          ? <PhoneIncoming className="h-5 w-5 text-success" />
                          : <PhoneOutgoing className="h-5 w-5 text-primary-glow" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {c.direction === "inbound" ? c.from_number : c.to_number}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleTimeString(localeMap[lang])} · {elapsed(c.started_at)}s
                        </div>
                      </div>
                      <Badge variant={c.status === "in_progress" ? "default" : "secondary"} className="gap-1">
                        {c.status === "in_progress" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        {c.status}
                      </Badge>
                    </div>
                    {last.length > 0 && (
                      <div className="space-y-1.5 border-t border-border pt-3 text-xs">
                        {last.map((m, i) => (
                          <div key={i} className="flex gap-1.5">
                            <span className="font-semibold uppercase opacity-60 shrink-0 w-12">{m.role}</span>
                            <span className="text-muted-foreground line-clamp-2">{m.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
