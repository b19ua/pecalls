import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

export const Route = createFileRoute("/_authenticated/calls/$callId")({ component: CallDetail });

type TranscriptItem = { role: "agent" | "user" | "system"; text: string; ts?: string };

function CallDetail() {
  const { t, lang } = useI18n();
  const { callId } = useParams({ from: "/_authenticated/calls/$callId" });
  const [call, setCall] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const getUrl = useServerFn(getRecordingSignedUrl);
  const retry = useServerFn(retryRecordingFn);

  const load = () => {
    setLoading(true);
    supabase.from("calls").select("*").eq("id", callId).single().then(({ data }) => {
      setCall(data); setLoading(false);
      if (data?.recording_path || data?.recording_url) {
        getUrl({ data: { callId } }).then((r) => setAudioUrl(r.url)).catch(() => {});
      } else {
        setAudioUrl(null);
      }
    });
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
        lang={lang}
        t={t}
      />




      <Card className="bg-gradient-card shadow-soft">
        <CardContent className="p-5">
          <h3 className="font-display text-lg font-semibold mb-3">{t("call.transcript")}</h3>
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
