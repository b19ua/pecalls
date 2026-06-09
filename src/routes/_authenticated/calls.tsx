import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneCall, PhoneIncoming, PhoneOutgoing, Download, Search, Play, Pause, X, AlertTriangle, Flag, Sparkles } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { getRecordingSignedUrl } from "@/lib/calls.functions";
import { formatManyTranscripts, downloadTextFile, formatCallTranscript, type CallLike } from "@/lib/transcript-export";
import { analyzePendingCallsFn } from "@/lib/call-analysis.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calls")({ component: CallsPage });

type Transcript = Array<{ role?: string; source?: string; text?: string }>;

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
  recording_path: string | null;
  recording_url: string | null;
  transcript: Transcript;
  summary: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  sentiment_score: number | null;
  complaint_flag: boolean;
  competitor_mentioned: boolean;
  competitor_names: string[] | null;
  topics: string[] | null;
};

type SortKey = "date_desc" | "date_asc" | "duration_desc" | "duration_asc";

function transcriptText(t: Transcript): string {
  if (!Array.isArray(t)) return "";
  return t.map((i) => i?.text ?? "").join(" ");
}

function sentimentEmoji(s: Call["sentiment"]): string {
  if (s === "positive") return "👍";
  if (s === "negative") return "👎";
  if (s === "neutral") return "😐";
  return "";
}

function CallsPage() {
  const { t, lang } = useI18n();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [direction, setDirection] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sentFilter, setSentFilter] = useState<string>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const getUrl = useServerFn(getRecordingSignedUrl);
  const analyzePending = useServerFn(analyzePendingCallsFn);

  const reload = () => {
    supabase
      .from("calls")
      .select("id,twilio_call_sid,direction,from_number,to_number,status,duration_seconds,started_at,created_at,recording_path,recording_url,transcript,summary,sentiment,sentiment_score,complaint_flag,competitor_mentioned,competitor_names,topics")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setCalls((data ?? []) as Call[]);
        setLoading(false);
      });
  };

  useEffect(() => { reload(); }, []);

  const localeMap = { ru: "ru-RU", ro: "ro-RO", en: "en-US" } as const;
  const locale = localeMap[lang];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = calls.filter((c) => {
      if (direction !== "all" && c.direction !== direction) return false;
      if (status !== "all" && c.status !== status) return false;
      if (sentFilter === "complaint" && !c.complaint_flag) return false;
      else if (sentFilter === "competitor" && !c.competitor_mentioned) return false;
      else if (sentFilter !== "all" && sentFilter !== "complaint" && sentFilter !== "competitor" && c.sentiment !== sentFilter) return false;
      if (!needle) return true;
      const hay = [
        c.from_number ?? "", c.to_number ?? "", c.summary ?? "",
        (c.topics ?? []).join(" "), (c.competitor_names ?? []).join(" "),
        transcriptText(c.transcript),
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "date_asc": return +new Date(a.created_at) - +new Date(b.created_at);
        case "duration_desc": return b.duration_seconds - a.duration_seconds;
        case "duration_asc": return a.duration_seconds - b.duration_seconds;
        default: return +new Date(b.created_at) - +new Date(a.created_at);
      }
    });
    return list;
  }, [calls, q, sort, direction, status, sentFilter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Call[]>();
    for (const c of filtered) {
      const d = new Date(c.created_at);
      const key = d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    return Array.from(groups.entries());
  }, [filtered, locale]);

  const exportCsv = () => {
    const header = ["created_at", "direction", "from", "to", "status", "duration_seconds", "sentiment", "complaint", "competitor", "topics", "summary"];
    const rows = filtered.map((c) => [c.created_at, c.direction, c.from_number ?? "", c.to_number ?? "", c.status, String(c.duration_seconds), c.sentiment ?? "", c.complaint_flag ? "yes" : "", c.competitor_mentioned ? "yes" : "", (c.topics ?? []).join("; "), (c.summary ?? "").replace(/\n/g, " ")]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `calls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const subsetByPeriod = (period: "day" | "week" | "month" | "all"): CallLike[] => {
    const now = Date.now();
    const cutoff = period === "day" ? now - 86400000
      : period === "week" ? now - 7 * 86400000
      : period === "month" ? now - 30 * 86400000 : 0;
    return calls.filter((c) => +new Date(c.created_at) >= cutoff) as unknown as CallLike[];
  };

  const exportTranscripts = (period: "day" | "week" | "month" | "all") => {
    const subset = subsetByPeriod(period);
    if (!subset.length) { toast.info("No calls in this period"); return; }
    const titleMap = {
      day: lang === "ru" ? "Транскрипции за день" : lang === "ro" ? "Transcrieri pe zi" : "Transcripts — last 24h",
      week: lang === "ru" ? "Транскрипции за неделю" : lang === "ro" ? "Transcrieri pe săptămână" : "Transcripts — last 7 days",
      month: lang === "ru" ? "Транскрипции за месяц" : lang === "ro" ? "Transcrieri pe lună" : "Transcripts — last 30 days",
      all: lang === "ru" ? "Все транскрипции" : lang === "ro" ? "Toate transcrierile" : "All transcripts",
    };
    const text = formatManyTranscripts(subset, titleMap[period], locale);
    downloadTextFile(`transcripts-${period}-${new Date().toISOString().slice(0, 10)}.txt`, text);
  };

  // PDF removed by request — TXT + MP3 only.

  const downloadOneTranscript = async (c: Call) => {
    const text = formatCallTranscript(c as unknown as CallLike, locale);
    downloadTextFile(`transcript-${new Date(c.created_at).toISOString().slice(0, 10)}-${c.id.slice(0, 8)}.txt`, text);
  };

  const runAnalyze = async () => {
    setAnalyzing(true);
    try {
      const r = await analyzePending({});
      toast.success(`Analyzed: ${r.ok} ok, ${r.fail} failed`);
      reload();
    } catch (e) { toast.error(String(e)); }
    finally { setAnalyzing(false); }
  };

  const togglePlay = async (c: Call) => {
    if (playingId === c.id) { setPlayingId(null); setPlayingUrl(null); return; }
    setLoadingAudio(c.id);
    try {
      const { url } = await getUrl({ data: { callId: c.id } });
      if (url) { setPlayingUrl(url); setPlayingId(c.id); }
    } catch (e) { console.error(e); }
    finally { setLoadingAudio(null); }
  };

  const statuses = useMemo(() => Array.from(new Set(calls.map((c) => c.status))), [calls]);

  const highlight = (text: string) => {
    if (!q.trim()) return text;
    const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
    if (i < 0) return text;
    return (<>{text.slice(0, i)}<mark className="bg-primary/20 text-foreground rounded px-0.5">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <PageHeader title={t("calls.title")} description={t("calls.subtitle")} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={runAnalyze} disabled={analyzing || !calls.length}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            {analyzing ? "…" : (lang === "ru" ? "Анализ настроений" : lang === "ro" ? "Analiză sentimente" : "Analyze sentiment")}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!calls.length}>
                <FileText className="h-4 w-4 mr-1.5" />
                PDF
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{lang === "ru" ? "PDF-отчёт" : lang === "ro" ? "Raport PDF" : "PDF report"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportPdfReport("day")}>{lang === "ru" ? "За день" : "Last 24 hours"}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportPdfReport("week")}>{lang === "ru" ? "За неделю" : "Last 7 days"}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportPdfReport("month")}>{lang === "ru" ? "За месяц" : "Last 30 days"}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportPdfReport("all")}>{lang === "ru" ? "Все звонки" : "All calls"}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!calls.length}>
                <Download className="h-4 w-4 mr-1.5" />
                TXT
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{lang === "ru" ? "Транскрипции" : "Transcripts"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportTranscripts("day")}>{lang === "ru" ? "За день" : "Last 24 hours"}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportTranscripts("week")}>{lang === "ru" ? "За неделю" : "Last 7 days"}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportTranscripts("month")}>{lang === "ru" ? "За месяц" : "Last 30 days"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportTranscripts("all")}>{lang === "ru" ? "Все" : "All calls"}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "ru" ? "Поиск…" : "Search…"} className="pl-9 pr-9" />
          {q && (<button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-4 w-4" /></button>)}
        </div>
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sentFilter} onValueChange={setSentFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sentiment</SelectItem>
            <SelectItem value="positive">👍 Positive</SelectItem>
            <SelectItem value="neutral">😐 Neutral</SelectItem>
            <SelectItem value="negative">👎 Negative</SelectItem>
            <SelectItem value="complaint">⚠ Complaints only</SelectItem>
            <SelectItem value="competitor">⚑ Competitor mentions</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Newest first</SelectItem>
            <SelectItem value="date_asc">Oldest first</SelectItem>
            <SelectItem value="duration_desc">Longest first</SelectItem>
            <SelectItem value="duration_asc">Shortest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground mb-3">{filtered.length} / {calls.length}</div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : calls.length === 0 ? (
        <Card className="bg-gradient-card border-dashed border-2"><CardContent className="py-16 text-center">
          <PhoneCall className="h-10 w-10 text-primary mx-auto mb-3" />
          <h3 className="font-display text-xl font-semibold mb-2">{t("calls.empty.title")}</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">{t("calls.empty.body")}</p>
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card className="bg-gradient-card border-dashed border-2"><CardContent className="py-12 text-center text-sm text-muted-foreground">No results</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">{day} · {items.length}</div>
              <div className="space-y-2">
                {items.map((c) => {
                  const isPlaying = playingId === c.id;
                  const hasRecording = !!(c.recording_path || c.recording_url);
                  const snippet = q.trim() ? findSnippet(transcriptText(c.transcript), q.trim()) : "";
                  return (
                    <Card key={c.id} className="bg-gradient-card shadow-soft hover:shadow-elegant transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            {c.direction === "inbound" ? <PhoneIncoming className="h-4 w-4 text-success" /> : <PhoneOutgoing className="h-4 w-4 text-primary-glow" />}
                          </div>
                          <Link to="/calls/$callId" params={{ callId: c.id }} className="flex-1 min-w-0">
                            <div className="font-medium truncate text-sm sm:text-base">
                              {highlight(String(c.direction === "inbound" ? c.from_number : c.to_number) || "—")} → {highlight(String(c.direction === "inbound" ? c.to_number : c.from_number) || "—")}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {new Date(c.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} · {c.duration_seconds}s
                              {c.summary ? ` · ${c.summary.slice(0, 90)}` : ""}
                            </div>
                            {(c.topics?.length ?? 0) > 0 && (
                              <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                                {(c.topics ?? []).slice(0, 4).join(" · ")}
                              </div>
                            )}
                          </Link>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {c.sentiment && (
                              <span title={`Sentiment: ${c.sentiment}`} className="text-base leading-none">{sentimentEmoji(c.sentiment)}</span>
                            )}
                            {c.complaint_flag && (
                              <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{lang === "ru" ? "жалоба" : "complaint"}</Badge>
                            )}
                            {c.competitor_mentioned && (
                              <Badge variant="secondary" className="gap-1"><Flag className="h-3 w-3" />{lang === "ru" ? "конкурент" : "competitor"}</Badge>
                            )}
                          </div>

                          {hasRecording && (
                            <Button variant="ghost" size="icon" onClick={(e) => { e.preventDefault(); togglePlay(c); }} disabled={loadingAudio === c.id} title={isPlaying ? "Pause" : "Play"}>
                              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={(e) => e.preventDefault()} title="Download">
                                <Download className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.preventDefault(); downloadOneTranscript(c); }}>Transcript (TXT)</DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.preventDefault(); downloadCallTranscriptPdf(c as unknown as CallLike, locale); }}>Transcript (PDF)</DropdownMenuItem>
                              {hasRecording && (
                                <DropdownMenuItem onClick={async (e) => {
                                  e.preventDefault();
                                  try { const { url } = await getUrl({ data: { callId: c.id } }); if (url) { const a = document.createElement("a"); a.href = url; a.download = `${c.id}.mp3`; a.click(); } }
                                  catch (err) { toast.error(String(err)); }
                                }}>Audio (MP3)</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Badge variant={c.status === "completed" ? "default" : c.status === "failed" ? "destructive" : "secondary"}>{c.status}</Badge>
                        </div>
                        {snippet && (
                          <div className="mt-2 ml-12 text-xs text-muted-foreground italic">…{highlight(snippet)}…</div>
                        )}
                        {isPlaying && playingUrl && (
                          <div className="mt-3 ml-12">
                            <audio controls autoPlay src={playingUrl} className="w-full max-w-md h-9" onEnded={() => setPlayingId(null)} />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function findSnippet(text: string, needle: string): string {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return "";
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + needle.length + 60);
  return text.slice(start, end);
}
