import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Loader2, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Status = "idle" | "connecting" | "live" | "ended" | "error";
type Line = { role: "user" | "agent"; text: string; ts: number };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WS_URL = SUPABASE_URL.replace(/^https?:/, "wss:").replace(/\/$/, "") + "/functions/v1/agent-test-bridge";

export function TestCallDialog({
  agentId,
  agentName,
  open,
  onOpenChange,
}: {
  agentId: string;
  agentName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [userLevel, setUserLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const inCtxRef = useRef<AudioContext | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playHeadRef = useRef<number>(0);
  const mutedRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length]);

  // Auto-stop on dialog close
  useEffect(() => {
    if (!open) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function start() {
    setError(null);
    setTranscript([]);
    setStatus("connecting");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Не авторизован");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      // 16kHz capture context
      const InCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const inCtx = new InCtx({ sampleRate: 16000 });
      inCtxRef.current = inCtx;
      const source = inCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const proc = inCtx.createScriptProcessor(2048, 1, 1);
      procRef.current = proc;

      // 24kHz playback context
      const OutCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const outCtx = new OutCtx({ sampleRate: 24000 });
      outCtxRef.current = outCtx;
      playHeadRef.current = outCtx.currentTime;

      const url = `${WS_URL}?agent_id=${encodeURIComponent(agentId)}&token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        // start audio pump
        proc.onaudioprocess = (ev) => {
          if (mutedRef.current || ws.readyState !== 1) return;
          const f32 = ev.inputBuffer.getChannelData(0);
          // level meter
          let sum = 0;
          for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
          setUserLevel(Math.min(1, Math.sqrt(sum / f32.length) * 4));
          // Float32 → Int16 LE
          const i16 = new Int16Array(f32.length);
          for (let i = 0; i < f32.length; i++) {
            const s = Math.max(-1, Math.min(1, f32[i]));
            i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          ws.send(i16.buffer);
        };
        source.connect(proc);
        proc.connect(inCtx.destination);
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "ready") setStatus("live");
            else if (msg.type === "transcript") {
              setTranscript((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === msg.role && Date.now() - last.ts < 1500) {
                  // append to last bubble
                  return [...prev.slice(0, -1), { ...last, text: last.text + msg.text }];
                }
                return [...prev, { role: msg.role, text: msg.text, ts: Date.now() }];
              });
            } else if (msg.type === "error") {
              setError(msg.message || "Ошибка");
            }
          } catch { /* ignore */ }
          return;
        }
        // Binary PCM16 24kHz from agent
        const pcm = new Int16Array(ev.data as ArrayBuffer);
        playPcm24k(pcm);
        // level meter for agent
        let sum = 0;
        for (let i = 0; i < Math.min(pcm.length, 1024); i++) sum += (pcm[i] / 32768) * (pcm[i] / 32768);
        setAgentLevel(Math.min(1, Math.sqrt(sum / Math.min(pcm.length, 1024)) * 3));
      };

      ws.onerror = () => setError("Ошибка соединения");
      ws.onclose = () => {
        if (status !== "ended") setStatus("ended");
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось запустить";
      setError(msg);
      setStatus("error");
      toast.error(msg);
      stop();
    }
  }

  function playPcm24k(pcm: Int16Array) {
    const ctx = outCtxRef.current;
    if (!ctx) return;
    const f32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    const start = Math.max(now, playHeadRef.current);
    src.start(start);
    playHeadRef.current = start + buf.duration;
    // decay agent level after playback
    setTimeout(() => setAgentLevel((v) => v * 0.3), (buf.duration * 1000) | 0);
  }

  function stop() {
    try { wsRef.current?.send(JSON.stringify({ type: "end" })); } catch { /* noop */ }
    try { wsRef.current?.close(); } catch { /* noop */ }
    wsRef.current = null;
    try { procRef.current?.disconnect(); } catch { /* noop */ }
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { inCtxRef.current?.close(); } catch { /* noop */ }
    try { outCtxRef.current?.close(); } catch { /* noop */ }
    procRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    inCtxRef.current = null;
    outCtxRef.current = null;
    setUserLevel(0);
    setAgentLevel(0);
    setStatus((s) => (s === "connecting" || s === "live" ? "ended" : s));
  }

  const isLive = status === "live";
  const isConnecting = status === "connecting";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-background to-background p-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Тестовый звонок</DialogTitle>
            <DialogDescription>
              Голосовой диалог с агентом «{agentName}» прямо в браузере. Без расхода Twilio.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5">
          {/* Orb + levels */}
          <div className="relative flex items-center justify-center h-44">
            <div
              className="absolute inset-0 m-auto rounded-full bg-primary/20 blur-2xl transition-all duration-200"
              style={{
                width: `${120 + agentLevel * 100}px`,
                height: `${120 + agentLevel * 100}px`,
                opacity: isLive ? 0.6 + agentLevel * 0.4 : 0.2,
              }}
            />
            <div
              className="absolute inset-0 m-auto rounded-full border border-primary/40 transition-all duration-150"
              style={{
                width: `${100 + userLevel * 60}px`,
                height: `${100 + userLevel * 60}px`,
                opacity: isLive ? 0.8 : 0.3,
              }}
            />
            <div className="relative h-28 w-28 rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-elegant flex items-center justify-center">
              {isConnecting ? (
                <Loader2 className="h-10 w-10 text-primary-foreground animate-spin" />
              ) : isLive ? (
                <Volume2 className="h-10 w-10 text-primary-foreground" />
              ) : (
                <Mic className="h-10 w-10 text-primary-foreground" />
              )}
            </div>
          </div>

          {/* Status pill */}
          <div className="flex items-center justify-center">
            <span
              className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border ${
                isLive
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : isConnecting
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                  : status === "error"
                  ? "bg-destructive/10 text-destructive border-destructive/30"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isLive ? "bg-emerald-500 animate-pulse" : isConnecting ? "bg-amber-500 animate-pulse" : status === "error" ? "bg-destructive" : "bg-muted-foreground"
                }`}
              />
              {isLive ? "В эфире" : isConnecting ? "Подключение…" : status === "ended" ? "Завершено" : status === "error" ? "Ошибка" : "Готов"}
            </span>
          </div>

          {/* Transcript */}
          <div className="h-44 rounded-lg border bg-muted/30 p-3 overflow-y-auto space-y-2 text-sm">
            {transcript.length === 0 ? (
              <p className="text-muted-foreground text-center mt-14 text-xs">
                {isLive ? "Говорите — агент вас слышит" : "Транскрипт появится здесь"}
              </p>
            ) : (
              transcript.map((l, i) => (
                <div key={i} className={`flex ${l.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-1.5 ${
                      l.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card border rounded-bl-sm"
                    }`}
                  >
                    {l.text}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {!isLive && !isConnecting ? (
              <Button onClick={start} className="bg-gradient-primary shadow-elegant px-6">
                <Mic className="h-4 w-4 mr-2" /> Начать разговор
              </Button>
            ) : (
              <>
                <Button
                  variant={muted ? "default" : "outline"}
                  size="icon"
                  onClick={() => setMuted((m) => !m)}
                  className="rounded-full h-12 w-12"
                  disabled={!isLive}
                  aria-label={muted ? "Включить микрофон" : "Выключить микрофон"}
                >
                  {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={stop}
                  className="rounded-full h-14 w-14 shadow-elegant"
                  aria-label="Завершить"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
