import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhoneCall, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/calls")({ component: CallsPage });

type Call = {
  id: string;
  twilio_call_sid: string | null;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  status: string;
  duration_seconds: number;
  started_at: string | null;
  created_at: string;
};

function CallsPage() {
  const { t, lang } = useI18n();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("calls")
      .select("id,twilio_call_sid,direction,from_number,to_number,status,duration_seconds,started_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setCalls((data ?? []) as Call[]);
        setLoading(false);
      });
  }, []);

  const localeMap = { ru: "ru-RU", ro: "ro-RO", en: "en-US" } as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("calls.title")} description={t("calls.subtitle")} />
      {loading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : calls.length === 0 ? (
        <Card className="bg-gradient-card border-dashed border-2">
          <CardContent className="py-16 text-center">
            <PhoneCall className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-display text-xl font-semibold mb-2">{t("calls.empty.title")}</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">{t("calls.empty.body")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {calls.map((c) => (
            <Link key={c.id} to="/calls/$callId" params={{ callId: c.id }}>
              <Card className="bg-gradient-card shadow-soft hover:shadow-elegant transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3 sm:gap-4">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {c.direction === "inbound" ? <PhoneIncoming className="h-4 w-4 text-success" /> : <PhoneOutgoing className="h-4 w-4 text-primary-glow" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm sm:text-base">
                      {c.direction === "inbound" ? c.from_number : c.to_number} → {c.direction === "inbound" ? c.to_number : c.from_number}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString(localeMap[lang])} · {c.duration_seconds}s
                    </div>
                  </div>
                  <Badge variant={c.status === "completed" ? "default" : c.status === "failed" ? "destructive" : "secondary"}>
                    {c.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
