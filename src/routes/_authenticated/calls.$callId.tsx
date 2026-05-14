import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calls/$callId")({ component: CallDetail });

type TranscriptItem = { role: "agent" | "user" | "system"; text: string; ts?: string };

function CallDetail() {
  const { callId } = useParams({ from: "/_authenticated/calls/$callId" });
  const [call, setCall] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("calls").select("*").eq("id", callId).single().then(({ data }) => {
      setCall(data); setLoading(false);
    });
  }, [callId]);

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка…</div>;
  if (!call) return <div className="p-8">Звонок не найден</div>;

  const transcript: TranscriptItem[] = Array.isArray(call.transcript) ? call.transcript : [];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/calls"><ArrowLeft className="h-4 w-4 mr-1" /> К списку</Link>
      </Button>
      <PageHeader
        title={`${call.direction === "inbound" ? "Входящий" : "Исходящий"} · ${call.status}`}
        description={`${call.from_number ?? "—"} → ${call.to_number ?? "—"} · ${call.duration_seconds}s`}
      />

      <div className="grid md:grid-cols-3 gap-4 mb-5">
        <Stat label="Длительность" value={`${call.duration_seconds}s`} />
        <Stat label="Токены" value={(call.input_tokens + call.output_tokens).toLocaleString()} />
        <Stat label="Стоимость" value={`$${Number(call.cost_usd ?? 0).toFixed(4)}`} />
      </div>

      {call.recording_url && (
        <Card className="bg-gradient-card shadow-soft mb-5">
          <CardContent className="p-5">
            <h3 className="font-display text-lg font-semibold mb-3">Запись</h3>
            <audio controls src={call.recording_url} className="w-full" />
          </CardContent>
        </Card>
      )}

      <Card className="bg-gradient-card shadow-soft">
        <CardContent className="p-5">
          <h3 className="font-display text-lg font-semibold mb-3">Транскрипция</h3>
          {transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">Транскрипция появится после завершения звонка.</p>
          ) : (
            <div className="space-y-3">
              {transcript.map((t, i) => (
                <div key={i} className={`flex ${t.role === "agent" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    t.role === "agent" ? "bg-primary/10 text-foreground" : "bg-secondary text-foreground"
                  }`}>
                    <div className="text-[10px] uppercase opacity-60 mb-0.5">{t.role}</div>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {call.summary && (
        <Card className="bg-gradient-card shadow-soft mt-5">
          <CardContent className="p-5">
            <h3 className="font-display text-lg font-semibold mb-2">Резюме</h3>
            <p className="text-sm whitespace-pre-wrap">{call.summary}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="bg-gradient-card shadow-soft">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
