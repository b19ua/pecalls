import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listTicketsFilteredFn, retryTicketFn, ticketsStatsFn, slaTrendFn } from "@/lib/tickets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Download, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/tickets")({
  head: () => ({ meta: [{ title: "Emergency tickets — Lunara" }] }),
  component: TicketsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

const STATUS_COLORS: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  failed: "bg-red-500/15 text-red-600 border-red-500/30",
  escalated: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  duplicate: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function TicketsPage() {
  const list = useServerFn(listTicketsFilteredFn);
  const retry = useServerFn(retryTicketFn);
  const stats = useServerFn(ticketsStatsFn);
  const qc = useQueryClient();

  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");

  const filters = useMemo(() => ({
    status: status === "all" ? undefined : [status as "pending"],
    q: q.trim() || undefined,
    limit: 200,
  }), [status, q]);

  const ticketsQ = useQuery({
    queryKey: ["tickets", filters],
    queryFn: () => list({ data: filters }),
    refetchInterval: 15_000,
  });

  const statsQ = useQuery({
    queryKey: ["ticketsStats"],
    queryFn: () => stats({}),
    refetchInterval: 30_000,
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: () => {
      toast.success("Заявка поставлена в очередь на повтор");
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const rows = ticketsQ.data?.tickets ?? [];
    const header = ["created_at","status","attempts","latency_ms","emergency_type","phone_number","nlc_number","facility_address","external_ticket_id","last_error","call_sid"];
    const lines = [header.join(",")].concat(
      rows.map((r) => header.map((h) => csvEscape((r as unknown as Record<string, unknown>)[h])).join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tickets-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = statsQ.data;
  const tickets = ticketsQ.data?.tickets ?? [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Аварийные заявки"
        description="Мониторинг создания заявок во второй CRM-системе"
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Всего (7д)" value={s?.total ?? "—"} />
        <StatCard label="Успех" value={s?.success ?? "—"} accent="text-emerald-600" />
        <StatCard label="Успешность" value={s ? `${s.successRate}%` : "—"} />
        <StatCard label="P95 задержка" value={s?.p95Latency != null ? `${s.p95Latency}ms` : "—"} />
        <StatCard
          label="Circuit breaker"
          value={s?.breakerOpen ? "OPEN" : "CLOSED"}
          accent={s?.breakerOpen ? "text-rose-600" : "text-emerald-600"}
          icon={s?.breakerOpen ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="success">Успех</SelectItem>
                <SelectItem value="pending">В очереди</SelectItem>
                <SelectItem value="failed">Ошибка</SelectItem>
                <SelectItem value="escalated">Эскалирован</SelectItem>
                <SelectItem value="duplicate">Дубликат</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Поиск: телефон, NLC, адрес, ticket_id..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-[320px]"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => ticketsQ.refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Обновить
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2">Время</th>
                <th className="text-left py-2 px-2">Статус</th>
                <th className="text-left py-2 px-2">Тип</th>
                <th className="text-left py-2 px-2">Телефон</th>
                <th className="text-left py-2 px-2">NLC</th>
                <th className="text-left py-2 px-2">Адрес</th>
                <th className="text-right py-2 px-2">Попытки</th>
                <th className="text-right py-2 px-2">Latency</th>
                <th className="text-left py-2 px-2">Ошибка / Ticket ID</th>
                <th className="text-right py-2 px-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Нет заявок</td></tr>
              )}
              {tickets.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-2 whitespace-nowrap text-xs">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 px-2">
                    <Badge variant="outline" className={STATUS_COLORS[t.status] ?? ""}>{t.status}</Badge>
                  </td>
                  <td className="py-2 px-2">{t.emergency_type ?? "—"}</td>
                  <td className="py-2 px-2 font-mono text-xs">{t.phone_number ?? "—"}</td>
                  <td className="py-2 px-2 font-mono text-xs">{t.nlc_number ?? "—"}</td>
                  <td className="py-2 px-2 max-w-[240px] truncate" title={t.facility_address ?? ""}>{t.facility_address ?? "—"}</td>
                  <td className="py-2 px-2 text-right">{t.attempts}/{t.max_attempts ?? 5}</td>
                  <td className="py-2 px-2 text-right">{t.latency_ms != null ? `${t.latency_ms}ms` : "—"}</td>
                  <td className="py-2 px-2 max-w-[280px] truncate text-xs">
                    {t.external_ticket_id
                      ? <span className="text-emerald-600">#{t.external_ticket_id}</span>
                      : <span className="text-red-600">{t.last_error ?? ""}</span>}
                    {t.next_retry_at && !t.external_ticket_id && (
                      <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                        <Clock className="h-3 w-3" />{new Date(t.next_retry_at).toLocaleTimeString()}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {(t.status === "failed" || t.status === "escalated") && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={retryMut.isPending}
                        onClick={() => retryMut.mutate(t.id)}
                      >
                        Повторить
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent, icon }: { label: string; value: string | number; accent?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          {icon}{label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
