import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, RefreshCw, AlertCircle, CheckCircle2, Mic, Download, Sparkles, AlertTriangle, Flag } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { getRecordingSignedUrl } from "@/lib/calls.functions";
import { retryRecordingFn } from "@/lib/twilio-recording.functions";
import { analyzeCallFn } from "@/lib/call-analysis.functions";
import { toast } from "sonner";
import { getCallContentFn } from "@/lib/data-residency.functions";
import { formatCallTranscript, downloadTextFile, groupTranscriptByTurn, type CallLike } from "@/lib/transcript-export";

export const Route = createFileRoute("/_authenticated/calls/$callId")({ component: CallDetail });

function sentimentEmoji(s: string | null | undefined) {
  if (s === "positive") return "👍";
  if (s === "negative") return "👎";
  if (s === "neutral") return "😐";
  return "—";
}

function CallDetail() {
  const { t, lang } = useI18n();
  const { callId } = useParams({ from: "/_authenticated/calls/$callId" });
  const [call, setCall] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const getUrl = useServerFn(getRecordingSignedUrl);
  const retry = useServerFn(retryRecordingFn);
  const getContent = useServerFn(getCallContentFn);
  const analyze = useServerFn(analyzeCallFn);

  const load = async () => {
    setLoading(true);
    setContentLoading(true);
    const { data } = await supabase.from("calls").select("*").eq("id", callId).single();
    setCall(data);
    setLoading(false);
    try {
      const content = await getContent({ data: { callId } });
      setAudioUrl(content.audioUrl);
      if (data) {
        setCall({
          ...data,
          transcript: Array.isArray(content.transcript) && content.transcript.length ? content.transcript : data.transcript,
          summary: content.summary ?? data.summary,
        });
      }
    } catch {
      if (data?.recording_path || data?.recording_url) {
        getUrl({ data: { callId } }).then((r) => setAudioUrl(r.url)).catch(() => {});
      } else setAudioUrl(null);
    } finally { setContentLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [callId]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const r = await retry({ data: { callId } });
      if (r.ok) { toast.success("Recording requested"); setTimeout(load, 1500); }
      else toast.error(r.error ?? "Failed");
    } catch (e) { toast.error(String(e)); } finally { setRetrying(false); }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const r = await analyze({ data: { callId } });
      if (r.ok) { toast.success("Analyzed"); load(); }
      else toast.error(r.error ?? "Analyze failed");
    } catch (e) { toast.error(String(e)); } finally { setAnalyzing(false); }
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}</div>;
  if (!call) return <div className="p-8">{t("calls.empty.title")}</div>;

  const rawTranscript = Array.isArray(call.transcript) ? call.transcript : [];
  const turns = groupTranscriptByTurn(rawTranscript);
  const locale = lang === "ru" ? "ru-RU" : lang === "ro" ? "ro-RO" : "en-US";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/calls"><ArrowLeft className="h-4 w-4 mr-1" /> {t("call.back")}</Link>
      </Button>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <PageHeader
          title={`${call.direction === "inbound" ? t("call.inbound") : t("call.outbound")} · ${call.status}`}
          description={`${call.from_number ?? "—"} → ${call.to_number ?? "—"} · ${call.duration_seconds}s`}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={analyzing || !turns.length}>
            {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {lang === "ru" ? "Анализ" : "Analyze"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { const text = formatCallTranscript(call as CallLike, locale); downloadTextFile(`transcript-${call.id.slice(0, 8)}.txt`, text); }} disabled={!turns.length}>
            <Download className="h-4 w-4 mr-2" /> TXT
          </Button>
          <Button size="sm" onClick={() => downloadCallTranscriptPdf(call as CallLike, locale)} disabled={!turns.length}>
            <FileText className="h-4 w-4 mr-2" /> PDF
          </Button>
        </div>
      </div>

      {/* Summary at the top */}
      {call.summary && (
        <Card className="bg-gradient-card shadow-soft mb-4 border-l-4 border-primary">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="font-display text-lg font-semibold">{t("call.summary")}</h3>
              <span className="text-xl ml-1">{sentimentEmoji(call.sentiment)}</span>
              {call.complaint_flag && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{lang === "ru" ? "Жалоба" : "Complaint"}</Badge>}
              {call.competitor_mentioned && <Badge variant="secondary" className="gap-1"><Flag className="h-3 w-3" />{lang === "ru" ? "Конкурент" : "Competitor"}{(call.competitor_names ?? []).length ? `: ${(call.competitor_names ?? []).join(", ")}` : ""}</Badge>}
            </div>
            <p className="text-sm whitespace-pre-wrap text-foreground/90">{call.summary}</p>
            {(call.topics?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(call.topics ?? []).map((tp: string) => <Badge key={tp} variant="outline" className="text-xs">{tp}</Badge>)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        <Stat label={t("call.duration")} value={`${call.duration_seconds}s`} />
        <Stat label={t("call.tokens")} value={(call.input_tokens + call.output_tokens).toLocaleString()} />
        <Stat label={t("call.cost")} value={`$${Number(call.cost_usd ?? 0).toFixed(4)}`} />
      </div>

      <RecordingStatusCard call={call} audioUrl={audioUrl} onRetry={handleRetry} retrying={retrying} contentLoading={contentLoading} lang={lang} t={t} />

      <Card className="bg-gradient-card shadow-soft">
        <CardContent className="p-5">
          <h3 className="font-display text-lg font-semibold mb-4">{t("call.transcript")}</h3>
          {turns.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("call.transcript.empty")}</p>
          ) : (
            <div className="space-y-4">
              {turns.map((tr, i) => (
                <div key={i} className={`flex ${tr.role === "AGENT" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                    tr.role === "AGENT" ? "bg-primary/10 text-foreground" : tr.role === "SYSTEM" ? "bg-muted text-muted-foreground italic" : "bg-secondary text-foreground"
                  }`}>
                    <div className="text-[10px] uppercase opacity-60 mb-1 font-semibold tracking-wide">{tr.role}{tr.at ? ` · ${tr.at}` : ""}</div>
                    {tr.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="bg-gradient-card shadow-soft">
      <CardContent className="p-3 sm:p-4">
        <div className="text-[11px] sm:text-xs text-muted-foreground">{label}</div>
        <div className="font-display text-lg sm:text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function RecordingStatusCard({
  call, audioUrl, onRetry, retrying, contentLoading, lang, t,
}: {
  call: any; audioUrl: string | null; onRetry: () => void; retrying: boolean;
  contentLoading: boolean; lang: "ru" | "ro" | "en"; t: (k: string) => string;
}) {
  const status: string = call.recording_status ?? (call.recording_path || call.recording_url ? "ready" : "pending");
  const has = !!(call.recording_path || call.recording_url) && !!audioUrl;
  const tr = (ru: string, ro: string, en: string) => lang === "ru" ? ru : lang === "ro" ? ro : en;
  const labelByStatus: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
    pending: { label: tr("Запись не запрошена", "Înregistrare necerută", "Recording not requested"), icon: <Mic className="h-4 w-4" />, tone: "text-muted-foreground" },
    requested: { label: tr("Запрос отправлен…", "Cerere trimisă…", "Requesting…"), icon: <Loader2 className="h-4 w-4 animate-spin" />, tone: "text-muted-foreground" },
    recording: { label: tr("Идёт запись", "Înregistrare", "Recording"), icon: <Mic className="h-4 w-4" />, tone: "text-primary" },
    ready: { label: tr("Запись готова", "Gata", "Ready"), icon: <CheckCircle2 className="h-4 w-4" />, tone: "text-success" },
    failed: { label: tr("Ошибка записи", "Eroare", "Failed"), icon: <AlertCircle className="h-4 w-4" />, tone: "text-destructive" },
  };
  const meta = labelByStatus[status] ?? labelByStatus.pending;
  const isLive = call.status === "in_progress";
  const canRetry = status === "failed" || status === "pending" || (status === "requested" && !isLive);

  return (
    <Card className="bg-gradient-card shadow-soft mb-5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="font-display text-lg font-semibold">{t("call.recording")}</h3>
          <div className={`flex items-center gap-2 text-sm ${meta.tone}`}>{meta.icon}<span>{meta.label}</span></div>
        </div>
        {has ? (
          <div className="space-y-3">
            <audio controls src={audioUrl!} className="w-full" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild><a href={audioUrl!} target="_blank" rel="noreferrer">{tr("Открыть файл", "Deschide", "Open file")}</a></Button>
              <Button size="sm" asChild><a href={audioUrl!} download>{tr("Скачать запись", "Descarcă", "Download recording")}</a></Button>
            </div>
          </div>
        ) : status === "ready" ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {contentLoading ? t("common.loading") : tr("Файл готовится", "Se pregătește", "Preparing file")}</div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {status === "failed" ? tr("Twilio не подтвердил запись.", "Twilio nu a confirmat.", "Twilio did not confirm.")
              : status === "requested" || status === "recording" ? tr("Файл появится после звонка.", "Va apărea după apel.", "File appears after the call.")
              : tr("Запись не запрашивалась.", "Necerută.", "No recording was requested.")}
          </div>
        )}
        {call.recording_error && (<div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive break-words">{call.recording_error}</div>)}
        {canRetry && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {tr("Запросить повторно", "Re-cere", "Retry recording")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
