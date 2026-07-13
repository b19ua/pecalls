import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTicketFn, retryTicketFn } from "@/lib/tickets.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tickets/$ticketId")({
  head: () => ({ meta: [{ title: "Ticket — Lunara" }] }),
  component: TicketDetailPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

const STATUS: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  failed: "bg-red-500/15 text-red-600 border-red-500/30",
  escalated: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  duplicate: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

function TicketDetailPage() {
  const { ticketId } = useParams({ from: "/_authenticated/tickets/$ticketId" });
  const get = useServerFn(getTicketFn);
  const retry = useServerFn(retryTicketFn);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => get({ data: { id: ticketId } }),
    refetchInterval: 15_000,
  });

  const retryMut = useMutation({
    mutationFn: () => retry({ data: { id: ticketId } }),
    onSuccess: () => {
      toast.success("Заявка поставлена на повтор");
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }
  if (q.error) return <div className="p-6 text-destructive">{(q.error as Error).message}</div>;

  const t = q.data ? (JSON.parse(q.data.ticketJson) as Record<string, unknown>) : null;
  if (!t) return <div className="p-6">Not found</div>;

  const status = String(t.status ?? "");
  const response = (t.response ?? {}) as Record<string, unknown>;
  const payload = (t.payload ?? {}) as Record<string, unknown>;

  const timeline: Array<{ at: string; label: string; detail?: string }> = [];
  if (t.created_at) timeline.push({ at: String(t.created_at), label: "Создана" });
  if (t.updated_at && t.updated_at !== t.created_at) timeline.push({ at: String(t.updated_at), label: "Обновлена" });
  if (t.notified_at) timeline.push({ at: String(t.notified_at), label: "Уведомление супервайзеру" });
  if (t.escalated_at) timeline.push({ at: String(t.escalated_at), label: "Эскалация", detail: String(t.escalation_reason ?? "") });
  if (t.next_retry_at) timeline.push({ at: String(t.next_retry_at), label: "Следующий повтор" });
  const webhookAt = (response as { webhook_at?: string }).webhook_at;
  if (webhookAt) timeline.push({ at: webhookAt, label: `Callback CRM: ${String(t.external_status ?? "")}` });
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/tickets"><ArrowLeft className="h-4 w-4 mr-1" /> К списку</Link>
        </Button>
      </div>
      <PageHeader
        title={`Заявка ${String(t.id).slice(0, 8)}…`}
        description={<div className="flex items-center gap-2">
          <Badge className={STATUS[status] ?? ""} variant="outline">{status}</Badge>
          <span className="text-sm text-muted-foreground">Попытки: {String(t.attempts ?? 0)} / {String(t.max_attempts ?? 5)}</span>
          {q.data?.supervisor && <Badge variant="outline">Supervisor</Badge>}
        </div>}
        actions={
          <Button size="sm" onClick={() => retryMut.mutate()} disabled={retryMut.isPending || status === "success"}>
            <RefreshCw className="h-4 w-4 mr-1" /> Повторить
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Данные заявки</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row k="Тип" v={t.emergency_type} />
            <Row k="Телефон" v={t.phone_number} />
            <Row k="NLC" v={t.nlc_number} />
            <Row k="Адрес" v={t.facility_address} />
            <Row k="Комментарий" v={t.caller_comment} />
            <Row k="Call SID" v={t.call_sid} />
            <Row k="External ID" v={t.external_ticket_id} />
            <Row k="Idempotency-Key" v={t.idempotency_key} />
            <Row k="Latency" v={t.latency_ms != null ? `${t.latency_ms} ms` : null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Хронология</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {timeline.length === 0 && <li className="text-muted-foreground">Пусто</li>}
              {timeline.map((e, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-xs text-muted-foreground w-40 shrink-0">{new Date(e.at).toLocaleString()}</span>
                  <div>
                    <div className="font-medium">{e.label}</div>
                    {e.detail && <div className="text-muted-foreground text-xs">{e.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
            {t.last_error ? (
              <div className="mt-4 text-sm">
                <div className="font-medium text-red-600 mb-1">Последняя ошибка</div>
                <pre className="whitespace-pre-wrap text-xs bg-muted/50 p-2 rounded">{String(t.last_error)}</pre>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Отправлено в CRM</CardTitle></CardHeader>
          <CardContent><Json data={payload} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Ответ / webhook</CardTitle></CardHeader>
          <CardContent><Json data={response} /></CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="flex gap-3">
      <span className="w-32 text-muted-foreground shrink-0">{k}</span>
      <span className="break-all">{v == null || v === "" ? "—" : String(v)}</span>
    </div>
  );
}

function Json({ data }: { data: unknown }) {
  return (
    <pre className="text-xs bg-muted/50 p-2 rounded max-h-80 overflow-auto whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
