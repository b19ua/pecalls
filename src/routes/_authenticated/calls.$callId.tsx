import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, RefreshCw, AlertCircle, CheckCircle2, Mic } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { getRecordingSignedUrl } from "@/lib/calls.functions";
import { retryRecordingFn } from "@/lib/twilio-recording.functions";
import { toast } from "sonner";
import { getCallContentFn } from "@/lib/data-residency.functions";
import { formatCallTranscript, downloadTextFile } from "@/lib/transcript-export";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calls/$callId")({ component: CallDetail });

type TranscriptItem = { role: "agent" | "user" | "system"; text: string; ts?: string };

function CallDetail() {
  const { t, lang } = useI18n();
  const { callId } = useParams({ from: "/_authenticated/calls/$callId" });
  const [call, setCall] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const getUrl = useServerFn(getRecordingSignedUrl);
  const retry = useServerFn(retryRecordingFn);
  const getContent = useServerFn(getCallContentFn);

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
      } else {
        setAudioUrl(null);
      }
    } finally {
      setContentLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [callId]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const r = await retry({ data: { callId } });
      if (r.ok) {
        toast.success(lang === "ru" ? "Запись запрошена у Twilio" : lang === "ro" ? "Înregistrare cerută" : "Recording requested");
        setTimeout(load, 1500);
      } else {
        toast.error(r.error ?? "Failed");
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setRetrying(false);
    }
  };

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}</div>;
  if (!call) return <div className="p-8">{t("calls.empty.title")}</div>;

  const transcript: TranscriptItem[] = Array.isArray(call.transcript) ? call.transcript : [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/calls"><ArrowLeft className="h-4 w-4 mr-1" /> {t("call.back")}</Link>
      </Button>
      <PageHeader
        title={`${call.direction === "inbound" ? t("call.inbound") : t("call.outbound")} · ${call.status}`}
        description={`${call.from_number ?? "—"} → ${call.to_number ?? "—"} · ${call.duration_seconds}s`}
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        <Stat label={t("call.duration")} value={`${call.duration_seconds}s`} />
        <Stat label={t("call.tokens")} value={(call.input_tokens + call.output_tokens).toLocaleString()} />
        <Stat label={t("call.cost")} value={`$${Number(call.cost_usd ?? 0).toFixed(4)}`} />
      </div>

      <RecordingStatusCard
        call={call}
        audioUrl={audioUrl}
        onRetry={handleRetry}
        retrying={retrying}
        contentLoading={contentLoading}
        lang={lang}
        t={t}
      />




      <Card className="bg-gradient-card shadow-soft">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h3 className="font-display text-lg font-semibold">{t("call.transcript")}</h3>
            {transcript.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const locale = lang === "ru" ? "ru-RU" : lang === "ro" ? "ro-RO" : "en-US";
                  const text = formatCallTranscript(call, locale);
                  const date = new Date(call.created_at).toISOString().slice(0, 10);
                  downloadTextFile(`transcript-${date}-${call.id.slice(0, 8)}.txt`, text);
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                {lang === "ru" ? "Скачать транскрипцию" : lang === "ro" ? "Descarcă transcrierea" : "Download transcript"}
              </Button>
            )}
          </div>
          {transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("call.transcript.empty")}</p>
          ) : (
            <div className="space-y-3">
              {transcript.map((tr, i) => (
                <div key={i} className={`flex ${tr.role === "agent" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                    tr.role === "agent" ? "bg-primary/10 text-foreground" : "bg-secondary text-foreground"
                  }`}>
                    <div className="text-[10px] uppercase opacity-60 mb-0.5">{tr.role}</div>
                    {tr.text}
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
            <h3 className="font-display text-lg font-semibold mb-2">{t("call.summary")}</h3>
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
  contentLoading: boolean;
  lang: "ru" | "ro" | "en"; t: (k: string) => string;
}) {
  const status: string = call.recording_status ?? (call.recording_path || call.recording_url ? "ready" : "pending");
  const has = !!(call.recording_path || call.recording_url) && !!audioUrl;

  const tr = (ru: string, ro: string, en: string) =>
    lang === "ru" ? ru : lang === "ro" ? ro : en;

  const labelByStatus: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
    pending: {
      label: tr("Запись не запрошена", "Înregistrare necerută", "Recording not requested"),
      icon: <Mic className="h-4 w-4" />, tone: "text-muted-foreground",
    },
    requested: {
      label: tr("Запрос отправлен в Twilio…", "Cerere trimisă către Twilio…", "Requesting from Twilio…"),
      icon: <Loader2 className="h-4 w-4 animate-spin" />, tone: "text-muted-foreground",
    },
    recording: {
      label: tr("Идёт запись звонка", "Înregistrare în curs", "Recording in progress"),
      icon: <Mic className="h-4 w-4" />, tone: "text-primary",
    },
    ready: {
      label: tr("Запись готова", "Înregistrare gata", "Recording ready"),
      icon: <CheckCircle2 className="h-4 w-4" />, tone: "text-success",
    },
    failed: {
      label: tr("Ошибка записи", "Eroare la înregistrare", "Recording failed"),
      icon: <AlertCircle className="h-4 w-4" />, tone: "text-destructive",
    },
  };
  const meta = labelByStatus[status] ?? labelByStatus.pending;
  const isLive = call.status === "in_progress";
  const canRetry = status === "failed" || status === "pending" || (status === "requested" && !isLive);

  return (
    <Card className="bg-gradient-card shadow-soft mb-5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="font-display text-lg font-semibold">{t("call.recording")}</h3>
          <div className={`flex items-center gap-2 text-sm ${meta.tone}`}>
            {meta.icon}<span>{meta.label}</span>
          </div>
        </div>

        {has ? (
          <div className="space-y-3">
            <audio controls src={audioUrl!} className="w-full" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={audioUrl!} target="_blank" rel="noreferrer">{tr("Открыть файл", "Deschide fișierul", "Open file")}</a>
              </Button>
              <Button size="sm" asChild>
                <a href={audioUrl!} download>{tr("Скачать запись", "Descarcă înregistrarea", "Download recording")}</a>
              </Button>
            </div>
          </div>
        ) : status === "ready" ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {contentLoading ? t("common.loading") : tr("Файл ещё обрабатывается", "Fișierul încă se pregătește", "The file is still being prepared")}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {status === "failed"
              ? tr(
                  "Twilio не подтвердил старт записи. Можно попробовать ещё раз.",
                  "Twilio nu a confirmat înregistrarea. Încearcă din nou.",
                  "Twilio did not confirm the recording start. You can retry.",
                )
              : status === "requested" || status === "recording"
              ? tr(
                  "Файл появится сразу после завершения звонка.",
                  "Fișierul va apărea după încheierea apelului.",
                  "The file will appear right after the call ends.",
                )
              : tr(
                  "Для этого звонка запись не запрашивалась.",
                  "Pentru acest apel nu s-a cerut înregistrare.",
                  "No recording was requested for this call.",
                )}
          </div>
        )}

        {call.recording_error && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive break-words">
            {call.recording_error}
          </div>
        )}

        {canRetry && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {tr("Запросить запись повторно", "Re-cere înregistrarea", "Retry recording")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
