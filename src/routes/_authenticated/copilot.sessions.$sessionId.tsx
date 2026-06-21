import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Check, Lightbulb, Radio, MessageSquare } from "lucide-react";
import { getCopilotSession, acknowledgeSuggestion } from "@/lib/copilot.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/copilot/sessions/$sessionId")({ component: Page });

type Whisper = { id: string; text: string; created_at: string; read_at: string | null };

type Suggestion = {
  id: string; ts: string; category: string | null; priority: string;
  suggestion_text: string; trigger_quote: string | null; rationale: string | null;
  emotion: string | null; acknowledged: boolean; used: boolean;
};
type Transcript = { id: string; ts: string; speaker: string; text: string };
type Session = {
  id: string; status: string; started_at: string; ended_at: string | null;
  customer_phone: string | null; manager_name: string | null; call_sid: string | null;
  summary: string | null;
  summary_data: Record<string, unknown> | null;
  is_test?: boolean | null;
};

function priorityColor(p: string) {
  if (p === "high") return "bg-destructive text-destructive-foreground";
  if (p === "low") return "bg-muted text-muted-foreground";
  return "bg-primary text-primary-foreground";
}

function Page() {
  const { sessionId } = useParams({ from: "/_authenticated/copilot/sessions/$sessionId" });
  const navigate = useNavigate();
  const get = useServerFn(getCopilotSession);
  const ack = useServerFn(acknowledgeSuggestion);
  const [session, setSession] = useState<Session | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [whispers, setWhispers] = useState<Whisper[]>([]);

  const reload = async () => {
    try {
      const r = await get({ data: { id: sessionId } });
      setSession(r.session as Session);
      setSuggestions((r.suggestions ?? []) as Suggestion[]);
      setTranscript((r.transcript ?? []) as Transcript[]);
    } catch (e) { toast.error((e as Error).message); }
  };

  // Auto-ack a whisper as "delivered" (read_at = now) so the supervisor
  // knows it landed. Fire-and-forget; RLS scopes by owner_id.
  const ackWhisperDelivered = async (w: Whisper) => {
    if (w.read_at) return;
    try {
      await supabase.from("whispers")
        .update({ read_at: new Date().toISOString() })
        .eq("id", w.id).is("read_at", null);
    } catch (e) { console.error("whisper ack", e); }
  };

  useEffect(() => {
    reload();
    // Load any whispers already addressed to this session, then mark delivered.
    void (async () => {
      const { data } = await supabase.from("whispers")
        .select("id,text,created_at,read_at")
        .eq("call_id", sessionId).eq("call_kind", "copilot_session")
        .order("created_at", { ascending: true });
      const list = (data ?? []) as Whisper[];
      setWhispers(list);
      list.filter((w) => !w.read_at).forEach((w) => void ackWhisperDelivered(w));
    })();

    const ch = supabase
      .channel(`copilot-session-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "copilot_suggestions", filter: `session_id=eq.${sessionId}` },
        (p) => setSuggestions((s) => [...s, p.new as Suggestion]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "copilot_suggestions", filter: `session_id=eq.${sessionId}` },
        (p) => setSuggestions((s) => s.map((x) => x.id === (p.new as Suggestion).id ? (p.new as Suggestion) : x)))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "copilot_transcript", filter: `session_id=eq.${sessionId}` },
        (p) => setTranscript((t) => [...t, p.new as Transcript]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "copilot_sessions", filter: `id=eq.${sessionId}` },
        (p) => setSession(p.new as Session))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whispers", filter: `call_id=eq.${sessionId}` },
        (p) => {
          const w = p.new as Whisper;
          setWhispers((arr) => [...arr, w]);
          toast.info(`💬 Шёпот: ${w.text}`, { duration: 8000 });
          void ackWhisperDelivered(w);
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whispers", filter: `call_id=eq.${sessionId}` },
        (p) => setWhispers((arr) => arr.map((x) => x.id === (p.new as Whisper).id ? (p.new as Whisper) : x)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  const onAck = async (id: string, used: boolean) => {
    try { await ack({ data: { id, used } }); } catch (e) { toast.error((e as Error).message); }
  };

  if (!session) return <div className="p-8 text-muted-foreground">Загрузка…</div>;

  const live = session.status === "active";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate({ to: "/copilot" })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Назад
      </Button>
      <PageHeader
        title={session.customer_phone || session.call_sid || "Сессия"}
        description={`${session.manager_name ?? "—"} · начало ${new Date(session.started_at).toLocaleString()}`}
        actions={
          <Badge variant={live ? "default" : "secondary"} className="gap-1.5">
            {live ? <Radio className="h-3 w-3 animate-pulse" /> : null}
            {session.status}
          </Badge>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-0">
          <div className="px-5 py-3 border-b flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Подсказки</span>
            <Badge variant="secondary" className="ml-auto">{suggestions.length}</Badge>
          </div>
          <ScrollArea className="h-[60vh]">
            <div className="p-4 space-y-3">
              {suggestions.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  {live ? "Ожидаем первую подсказку…" : "Подсказок не было."}
                </div>
              ) : suggestions.map((s) => (
                <div key={s.id} className={`rounded-lg border p-3 ${s.acknowledged ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${priorityColor(s.priority)}`}>{s.priority}</span>
                    {s.category && <Badge variant="outline" className="text-[10px]">{s.category}</Badge>}
                    {s.emotion && <Badge variant="outline" className="text-[10px]">😶 {s.emotion}</Badge>}
                    <span className="ml-auto text-[10px] text-muted-foreground">{new Date(s.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-sm font-medium">{s.suggestion_text}</div>
                  {s.trigger_quote && <div className="text-xs text-muted-foreground mt-1 italic">«{s.trigger_quote}»</div>}
                  {s.rationale && <div className="text-xs text-muted-foreground mt-1">{s.rationale}</div>}
                  {!s.acknowledged && (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAck(s.id, true)}>
                        <Check className="h-3 w-3 mr-1" /> Использовал
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAck(s.id, false)}>
                        Закрыть
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent></Card>

        <Card><CardContent className="p-0">
          <div className="px-5 py-3 border-b flex items-center gap-2">
            <span className="font-medium text-sm">Транскрипт</span>
            <Badge variant="secondary" className="ml-auto">{transcript.length}</Badge>
          </div>
          <ScrollArea className="h-[60vh]">
            <div className="p-4 space-y-2">
              {transcript.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">Пусто</div>
              ) : transcript.map((m) => (
                <div key={m.id} className="text-sm">
                  <span className="font-semibold uppercase text-[10px] text-muted-foreground mr-2">{m.speaker}</span>
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent></Card>
      </div>

      {session.summary && <SummaryCard summary={session.summary} data={session.summary_data} />}
    </div>
  );
}

function SummaryCard({ summary, data }: { summary: string; data: Record<string, unknown> | null }) {
  const d = (data ?? {}) as {
    customer_intent?: string; objections?: string[]; next_steps?: string[];
    sentiment?: string; outcome?: string; manager_score?: number; coaching_tips?: string[];
  };
  return (
    <Card className="mt-4 border-primary/20"><CardContent className="p-5 space-y-4">
      <div>
        <div className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" /> AI-резюме звонка
        </div>
        <div className="text-sm whitespace-pre-wrap">{summary}</div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        {d.customer_intent && <Field label="Намерение клиента" value={d.customer_intent} />}
        {d.sentiment && <Field label="Эмоция" value={d.sentiment} />}
        {d.outcome && <Field label="Итог" value={d.outcome} />}
        {typeof d.manager_score === "number" && (
          <Field label="Оценка менеджера" value={`${d.manager_score} / 10`} />
        )}
      </div>
      {d.objections && d.objections.length > 0 && (
        <ListBlock title="Возражения" items={d.objections} />
      )}
      {d.next_steps && d.next_steps.length > 0 && (
        <ListBlock title="Следующие шаги" items={d.next_steps} />
      )}
      {d.coaching_tips && d.coaching_tips.length > 0 && (
        <ListBlock title="Советы менеджеру" items={d.coaching_tips} />
      )}
    </CardContent></Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground mb-1">{title}</div>
      <ul className="list-disc pl-5 space-y-0.5 text-sm">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
