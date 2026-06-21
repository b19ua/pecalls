import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Mic, MessageSquare, Activity, ShieldCheck, BookOpen,
  Plug, Megaphone, FileBarChart, PhoneCall, Lock, Zap, Server, Globe2,
  CheckCircle2, Sparkles, Wand2, Building2, LogIn,
} from "lucide-react";
import lunaraLogo from "@/assets/lunara-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lunara — On-Premise Voice AI for Enterprise" },
      {
        name: "description",
        content:
          "The self-hosted Voice AI platform. Real phone-line agents, AI Copilot for managers, live supervisor monitor and a compliance engine — on your servers, your numbers, your data.",
      },
      { property: "og:title", content: "Lunara — On-Premise Voice AI for Enterprise" },
      {
        property: "og:description",
        content:
          "Voice AI on your own infrastructure. Gemini Live + SIP/Twilio. The self-hosted alternative to Vapi, Retell and Bland.",
      },
      { property: "og:url", content: "https://lunara.now/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://lunara.now/" }],
  }),
  component: LandingPage,
});

/* -------------------------------------------------------------- */

const HEADING = { fontFamily: "'Space Grotesk', sans-serif" } as const;
const BODY = { fontFamily: "'DM Sans', sans-serif" } as const;

const WHATSAPP_URL =
  "https://wa.me/37369085447?text=" +
  encodeURIComponent("Hi Lunara team, I'd like to book a demo of the platform.");

function LandingPage() {
  return (
    <div
      className="min-h-screen w-full bg-[#f7f8fb] text-slate-900 selection:bg-emerald-200"
      style={BODY}
    >
      <Nav />
      <Hero />
      <BentoFeatures />
      <Pipeline />
      <Enterprise />
      <Comparison />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ----------------------------- Nav ----------------------------- */

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:h-20 sm:px-6">
        <div className="flex items-center gap-10 min-w-0">
          <Link to="/" className="flex items-center gap-2">
            <img src={lunaraLogo.url} alt="Lunara" className="h-10 w-10 rounded-full object-contain" />
            <span className="text-xl font-bold tracking-tight text-slate-900" style={HEADING}>
              Lunara
            </span>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex">
            <a href="#platform" className="transition-colors hover:text-emerald-700">Platform</a>
            <a href="#monitor" className="transition-colors hover:text-emerald-700">Live Monitor</a>
            <a href="#copilot" className="transition-colors hover:text-emerald-700">Copilot</a>
            <a href="#compliance" className="transition-colors hover:text-emerald-700">Compliance</a>
            <a href="#enterprise" className="transition-colors hover:text-emerald-700">On-Premise</a>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <LangSwitcher />
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 sm:px-4"
          >
            <LogIn className="h-4 w-4" />
            <span>Login</span>
          </Link>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-full bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition-all hover:bg-slate-800 md:inline-flex"
          >
            Book a demo
          </a>
        </div>
      </div>
    </nav>
  );
}

function LangSwitcher() {
  const [lang, setLang] = useState<"en" | "ro" | "ru">("en");
  const items: ("en" | "ro" | "ru")[] = ["en", "ro", "ru"];
  return (
    <div className="hidden items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-bold md:flex">
      {items.map((code, i) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`px-2 py-0.5 uppercase transition-colors ${
            lang === code ? "text-emerald-700" : "text-slate-400 hover:text-slate-900"
          } ${i > 0 ? "border-l border-slate-200" : ""}`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------- Hero ---------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-32 pt-20">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[10%] -top-[10%] h-[55%] w-[55%] rounded-full bg-emerald-200/40 blur-[140px]" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[45%] w-[45%] rounded-full bg-indigo-200/40 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            ON-PREMISE VOICE AI · ENTERPRISE STACK
          </div>

          <h1
            className="mb-8 text-5xl font-bold leading-[1.05] tracking-tight text-slate-900 md:text-6xl lg:text-7xl"
            style={HEADING}
          >
            Voice AI on{" "}
            <span className="bg-gradient-to-r from-emerald-600 to-indigo-600 bg-clip-text text-transparent">
              your own
            </span>{" "}
            infrastructure.
          </h1>

          <p className="mb-10 max-w-xl text-lg leading-relaxed text-slate-600">
            Deploy high-fidelity AI agents behind your firewall. Your servers, your phone numbers,
            your data — full sovereign control with sub-second Gemini Live latency, AI Copilot for
            human managers and a real-time compliance engine.
          </p>

          <div className="flex flex-wrap gap-4">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-7 py-4 text-base font-bold text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition-transform hover:scale-[1.02]"
            >
              Book a live demo
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href="#platform"
              className="rounded-xl border border-slate-300 bg-white px-7 py-4 text-base font-bold text-slate-800 shadow-sm transition-all hover:bg-slate-50"
            >
              See the platform
            </a>
          </div>

          <p className="mt-6 text-xs text-slate-500">
            Each partner gets a dedicated login URL on lunara.now. Test calls are live in 5 seconds.
          </p>
        </div>

        <LiveCallMockup />
      </div>

      {/* Trust strip */}
      <div className="mx-auto mt-24 flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm font-bold tracking-wider text-slate-400">
        <span>GEMINI LIVE</span>
        <span className="opacity-50">·</span>
        <span>SIP &amp; TWILIO</span>
        <span className="opacity-50">·</span>
        <span>ON-PREMISE</span>
        <span className="opacity-50">·</span>
        <span>EU DATA RESIDENCY</span>
        <span className="opacity-50">·</span>
        <span>SOC 2 READY</span>
        <span className="opacity-50">·</span>
        <span>BYOK / BYO-SIP</span>
      </div>
    </section>
  );
}

function LiveCallMockup() {
  const bars = [10, 18, 12, 22, 8, 16, 20, 14, 10, 24, 12, 18, 10];
  return (
    <div className="relative">
      <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-emerald-200/50 to-indigo-200/50 blur-2xl" />
      <div className="relative rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.25)]">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Active Call · #4931
            </p>
            <h3 className="mt-1 text-xl font-bold text-slate-900" style={HEADING}>
              Inbound · Customer Support
            </h3>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            RISK · HIGH 82%
          </div>
        </div>

        {/* Waveform */}
        <div className="mb-8 flex h-24 items-center justify-center gap-1 px-2">
          {bars.map((h, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-full ${i % 5 === 3 ? "bg-indigo-500" : "bg-emerald-500"}`}
              style={{
                height: `${h * 3}px`,
                animation: `pulse 1.${i % 6}s ease-in-out ${i * 60}ms infinite`,
              }}
            />
          ))}
        </div>

        {/* Customer line */}
        <div className="mb-4 rounded-2xl rounded-tl-none border border-slate-200 bg-slate-50 p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Customer
          </p>
          <p className="text-sm italic text-slate-700">
            “Look, I want my money back today or I'm cancelling everything.”
          </p>
        </div>

        {/* AI Copilot whisper */}
        <div className="rounded-2xl rounded-tr-none border border-indigo-200 bg-indigo-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
              AI Copilot whisper
            </span>
          </div>
          <p className="text-sm font-medium text-slate-800">
            Offer a 20% credit toward next renewal instead of a cash refund. Mention 14-day
            retention window from playbook §3.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Gemini Live
          </span>
          <span>Sentiment · Negative</span>
          <span className="flex items-center gap-1.5">
            Twilio PSTN <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Bento features ----------------------- */

function BentoFeatures() {
  return (
    <section id="platform" className="px-6 py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
            The platform
          </p>
          <h2 className="mb-4 text-4xl font-bold text-slate-900 md:text-5xl" style={HEADING}>
            Everything you need for enterprise Voice AI.
          </h2>
          <p className="text-lg text-slate-600">
            One stack for autonomous AI agents, human-led calls with Copilot, supervisor oversight,
            compliance, knowledge and analytics. Nothing leaves your perimeter.
          </p>
        </div>

        <div className="grid auto-rows-[180px] grid-cols-1 gap-5 md:grid-cols-4 lg:grid-cols-6">
          <BentoTile className="md:col-span-2 md:row-span-2 lg:col-span-3" accent="green">
            <BentoIcon color="green"><Mic className="h-5 w-5" /></BentoIcon>
            <h3 className="text-2xl font-bold text-slate-900" style={HEADING}>AI Voice Agents</h3>
            <p className="mt-3 max-w-md text-slate-600">
              Gemini Live native audio with sub-second latency. 8 human voices, auto language
              mirroring across EN / RO / RU and 30+ more, 20k-character system prompts and
              per-agent personalities.
            </p>
            <Tags items={["native-audio", "auto-mirror", "low-latency"]} />
          </BentoTile>

          <BentoTile id="copilot" className="md:col-span-2 md:row-span-2 lg:col-span-3" accent="violet">
            <BentoIcon color="violet"><MessageSquare className="h-5 w-5" /></BentoIcon>
            <h3 className="text-2xl font-bold text-slate-900" style={HEADING}>AI Copilot for Managers</h3>
            <p className="mt-3 max-w-md text-slate-600">
              Your human team stays on the line — the AI listens and whispers the next-best answer,
              objection handler or upsell. Live transcript, sentiment and source citations,
              streaming as the conversation unfolds.
            </p>
            <Tags items={["real-time whisper", "playbooks", "augmented agent"]} />
          </BentoTile>

          <BentoTile id="monitor" className="md:col-span-2 md:row-span-2 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-lg font-bold text-slate-900" style={HEADING}>Live Supervisor Monitor</h4>
              <Activity className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mb-4 text-xs text-slate-600">
              Risk scoring across every active call. Whisper to managers. Take over instantly.
            </p>
            <div className="space-y-2">
              <RiskRow label="AI · #4928" tone="green" status="Normal" />
              <RiskRow label="Copilot · #4930" tone="amber" status="Amber" />
              <RiskRow label="AI · #4931" tone="red" status="Take over" />
            </div>
          </BentoTile>

          <BentoTile id="compliance" className="md:col-span-2 md:row-span-2 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-lg font-bold text-slate-900" style={HEADING}>Compliance Engine</h4>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mb-4 text-xs text-slate-600">
              Must-say / must-not-say rules. Instant flags. Correction suggested in real time.
            </p>
            <div className="space-y-2 text-xs">
              <CheckRow text="Recording disclosure read" ok />
              <CheckRow text="GDPR opt-out mentioned" ok />
              <CheckRow text="“Guaranteed returns” — blocked" violation />
              <CheckRow text="Risk warning statement" pending />
            </div>
          </BentoTile>

          <BentoTile className="md:col-span-2 md:row-span-2 lg:col-span-2" accent="green">
            <BentoIcon color="green"><Server className="h-5 w-5" /></BentoIcon>
            <h4 className="text-lg font-bold text-slate-900" style={HEADING}>On-Premise &amp; Sovereign</h4>
            <p className="mt-2 text-sm text-slate-600">
              Deploy inside your VPC or bare metal. Your SIP, your LLM keys, your Postgres. Zero
              data leaves your network — ever.
            </p>
            <Tags items={["BYOK", "BYO-SIP", "EU residency"]} />
          </BentoTile>

          <BentoTile className="md:col-span-1 lg:col-span-2">
            <BentoIcon color="green"><BookOpen className="h-4 w-4" /></BentoIcon>
            <h5 className="text-base font-bold text-slate-900" style={HEADING}>RAG Knowledge Base</h5>
            <p className="mt-1 text-xs text-slate-600">
              PDF, DOCX, MD per agent. Chunked, embedded, top-matches injected on every call.
            </p>
          </BentoTile>

          <BentoTile className="md:col-span-1 lg:col-span-2">
            <BentoIcon color="violet"><Plug className="h-4 w-4" /></BentoIcon>
            <h5 className="text-base font-bold text-slate-900" style={HEADING}>Tools &amp; Webhooks</h5>
            <p className="mt-1 text-xs text-slate-600">
              Mid-call calls to HubSpot, Salesforce, Bitrix, or any private API. Function-calling
              with schema validation.
            </p>
          </BentoTile>

          <BentoTile className="md:col-span-2 lg:col-span-2">
            <BentoIcon color="green"><Megaphone className="h-4 w-4" /></BentoIcon>
            <h5 className="text-base font-bold text-slate-900" style={HEADING}>Inbound, Outbound &amp; Campaigns</h5>
            <p className="mt-1 text-xs text-slate-600">
              Point any number at an agent. Bulk dial CSVs with rate-limits, retries and timezone
              windows.
            </p>
          </BentoTile>

          <BentoTile className="md:col-span-2 lg:col-span-3">
            <BentoIcon color="violet"><FileBarChart className="h-4 w-4" /></BentoIcon>
            <h5 className="text-base font-bold text-slate-900" style={HEADING}>Post-Call Intelligence</h5>
            <p className="mt-1 text-xs text-slate-600">
              Auto summary, sentiment arc, top objections, coaching score and next-step recommendation
              the moment the call ends. Powered by Gemini Flash.
            </p>
          </BentoTile>

          <BentoTile className="md:col-span-2 lg:col-span-3" highlight>
            <div className="flex h-full flex-col justify-between">
              <div>
                <BentoIcon color="dark"><PhoneCall className="h-4 w-4" /></BentoIcon>
                <h5 className="mt-2 text-lg font-bold text-white" style={HEADING}>
                  Test Call — call yourself in 5 seconds.
                </h5>
                <p className="mt-1 text-xs font-medium text-white/80">
                  Type your number, hit go. The AI rings you, you talk to it, transcripts stream
                  into the dashboard live.
                </p>
              </div>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-bold text-slate-900 transition-transform hover:scale-[1.02]"
              >
                Launch test call <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </BentoTile>
        </div>
      </div>
    </section>
  );
}

function BentoTile({
  children, className = "", accent, highlight, id,
}: {
  children: React.ReactNode; className?: string;
  accent?: "green" | "violet"; highlight?: boolean; id?: string;
}) {
  const borderHover =
    accent === "green" ? "hover:border-emerald-300"
    : accent === "violet" ? "hover:border-indigo-300"
    : "hover:border-slate-300";
  if (highlight) {
    return (
      <div id={id} className={`relative overflow-hidden rounded-3xl bg-slate-900 p-6 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.5)] ${className}`}>
        {children}
      </div>
    );
  }
  return (
    <div
      id={id}
      className={`relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_12px_28px_-12px_rgba(15,23,42,0.15)] ${borderHover} ${className}`}
    >
      {accent === "green" && (
        <div className="pointer-events-none absolute -right-12 -bottom-12 h-44 w-44 rounded-full bg-emerald-100/60 blur-3xl" />
      )}
      {accent === "violet" && (
        <div className="pointer-events-none absolute -right-12 -bottom-12 h-44 w-44 rounded-full bg-indigo-100/60 blur-3xl" />
      )}
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </div>
  );
}

function BentoIcon({ color, children }: { color: "green" | "violet" | "dark"; children: React.ReactNode }) {
  const cls =
    color === "green" ? "bg-emerald-100 text-emerald-700"
    : color === "violet" ? "bg-indigo-100 text-indigo-700"
    : "bg-white/10 text-emerald-300";
  return (
    <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${cls}`}>
      {children}
    </div>
  );
}

function Tags({ items }: { items: string[] }) {
  return (
    <div className="mt-auto flex flex-wrap gap-2 pt-5">
      {items.map((t) => (
        <span key={t} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
          {t}
        </span>
      ))}
    </div>
  );
}

function RiskRow({ label, tone, status }: { label: string; tone: "green" | "amber" | "red"; status: string }) {
  const map = {
    green: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", border: "border-slate-200" },
    amber: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700", border: "border-amber-200" },
    red:   { dot: "bg-red-500 animate-pulse", chip: "bg-red-50 text-red-700", border: "border-red-200 bg-red-50/40" },
  }[tone];
  return (
    <div className={`flex items-center justify-between rounded-lg border ${map.border} bg-white px-3 py-2`}>
      <span className="flex items-center gap-2 text-xs font-medium text-slate-800">
        <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} />
        {label}
      </span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${map.chip}`}>
        {status}
      </span>
    </div>
  );
}

function CheckRow({ text, ok, violation, pending }: { text: string; ok?: boolean; violation?: boolean; pending?: boolean }) {
  if (ok) return (
    <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{text}</div>
  );
  if (violation) return (
    <div className="flex items-center gap-2 text-red-600"><span className="grid h-3.5 w-3.5 place-items-center rounded-sm bg-red-100 text-[10px] font-bold">!</span>{text}</div>
  );
  if (pending) return (
    <div className="flex items-center gap-2 text-slate-500"><span className="h-3.5 w-3.5 rounded-sm border border-slate-300" />{text}</div>
  );
  return null;
}

/* --------------------------- Pipeline -------------------------- */

function Pipeline() {
  const steps = [
    { n: "1", t: "Caller dials in", b: "Your SIP trunk or Twilio number routes the audio into the Lunara realtime bridge inside your VPC." },
    { n: "2", t: "Realtime audio stream", b: "A WebSocket pipes encrypted audio to Gemini Live with your prompt, voice and RAG context." },
    { n: "3", t: "Agent talks, tools fire", b: "The agent answers in the caller's language, calls your APIs and CRMs, hands off to a human when needed." },
    { n: "4", t: "Logged &amp; analyzed", b: "Recording, transcript, summary, sentiment and compliance signals saved — all on your storage." },
  ];
  return (
    <section className="bg-white px-6 py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">How it works</p>
          <h2 className="mb-4 text-4xl font-bold text-slate-900" style={HEADING}>The real-time pipeline.</h2>
          <p className="text-slate-600">From the caller's mouth to your CRM and back, in milliseconds.</p>
        </div>
        <div className="relative grid gap-8 md:grid-cols-4">
          <div className="absolute left-[6%] right-[6%] top-6 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent md:block" />
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="relative z-10 mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white font-bold text-emerald-700 shadow-sm" style={HEADING}>
                {s.n}
              </div>
              <h4 className="mb-2 text-lg font-bold text-slate-900" style={HEADING}>{s.t}</h4>
              <p className="text-sm leading-relaxed text-slate-600" dangerouslySetInnerHTML={{ __html: s.b }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------- Enterprise / on-prem ------------------- */

function Enterprise() {
  const items = [
    { icon: Server,      t: "Self-hosted deployment",     b: "Helm chart or Docker Compose. Runs in your VPC, your bare metal or your private cloud — no Lunara SaaS dependency." },
    { icon: Lock,        t: "Bring your own keys",        b: "Your Gemini / OpenAI / Anthropic keys. Your Twilio account, your SIP trunk. You own the supplier relationships." },
    { icon: Globe2,      t: "EU data residency",          b: "Deploy in Frankfurt, Bucharest, Chișinău. Recordings, transcripts and embeddings never leave the region you pick." },
    { icon: ShieldCheck, t: "Compliance & audit",         b: "Per-tenant role-based access, immutable audit log, signed webhooks, must-say / must-not-say rules enforced live." },
    { icon: Zap,         t: "Sub-second latency",         b: "Native-audio Gemini Live + warm Twilio media stream. End-to-end first-token latency typically under 700 ms." },
    { icon: Building2,   t: "Multi-tenant ready",         b: "Each partner gets their own login slug, agents, numbers and analytics — managed from one Lunara workspace." },
  ];
  return (
    <section id="enterprise" className="px-6 py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-14 grid items-end gap-6 md:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Built for enterprise</p>
            <h2 className="text-4xl font-bold text-slate-900 md:text-5xl" style={HEADING}>
              Your numbers. Your data. Your prompts.
            </h2>
          </div>
          <p className="text-lg text-slate-600">
            Lunara was built for regulated industries — energy, telecom, finance, healthcare — that
            simply cannot ship customer audio to a third-party SaaS. So we don't.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.t} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <it.icon className="h-5 w-5" />
              </div>
              <h4 className="mb-2 text-lg font-bold text-slate-900" style={HEADING}>{it.t}</h4>
              <p className="text-sm leading-relaxed text-slate-600">{it.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Comparison ------------------------- */

function Comparison() {
  const rows = [
    { feat: "On-premise / self-hosted",  lunara: true,  others: false },
    { feat: "Bring your own LLM keys",   lunara: true,  others: false },
    { feat: "Bring your own SIP / numbers", lunara: true, others: "partial" as const },
    { feat: "Audio never leaves your network", lunara: true, others: false },
    { feat: "AI Copilot for human managers", lunara: true, others: false },
    { feat: "Live supervisor monitor + take-over", lunara: true, others: false },
    { feat: "Compliance rules engine",   lunara: true,  others: false },
    { feat: "Multi-tenant white-label",  lunara: true,  others: "partial" as const },
  ];
  return (
    <section className="bg-white px-6 py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">The comparison</p>
          <h2 className="text-4xl font-bold text-slate-900 md:text-5xl" style={HEADING}>
            The self-hosted alternative to Vapi, Retell &amp; Bland.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">
            Same Gemini-grade conversation quality. None of the data-leaving-your-perimeter
            problem.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-slate-200 bg-slate-50 px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
            <span>Capability</span>
            <span className="w-24 text-center text-emerald-700">Lunara</span>
            <span className="w-24 text-center">SaaS voice AI</span>
          </div>
          {rows.map((r, i) => (
            <div
              key={r.feat}
              className={`grid grid-cols-[1fr_auto_auto] items-center gap-6 px-6 py-4 text-sm ${
                i % 2 === 1 ? "bg-slate-50/50" : ""
              }`}
            >
              <span className="text-slate-800">{r.feat}</span>
              <span className="w-24 text-center">
                <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" />
              </span>
              <span className="w-24 text-center text-slate-400">
                {r.others === true ? <CheckCircle2 className="mx-auto h-5 w-5" /> : r.others === "partial" ? "partial" : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Final CTA -------------------------- */

function FinalCta() {
  return (
    <section id="cta" className="px-6 py-28">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-1 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.2)]">
        <div className="relative rounded-[calc(2.5rem-4px)] bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 px-8 py-20 text-center">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-40 w-[60%] -translate-x-1/2 rounded-full bg-emerald-200/30 blur-[100px]" />
          </div>
          <div className="relative z-10">
            <div className="mx-auto mb-8 grid h-16 w-16 place-items-center rounded-2xl bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.25)]">
              <Wand2 className="h-7 w-7" />
            </div>
            <h2 className="mb-5 text-4xl font-bold text-slate-900 md:text-5xl" style={HEADING}>
              Put AI on your phone lines this quarter.
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-lg text-slate-600">
              Book a 30-minute architecture review. We'll spin up a sandbox in your tenant and
              ring your phone with a real agent before the call ends.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-slate-900 px-8 py-4 font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
              >
                Book a live demo
              </a>
              <Link to="/login" className="rounded-xl border border-slate-300 bg-white px-8 py-4 font-bold text-slate-800 shadow-sm transition-all hover:bg-slate-50">
                Client login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Footer --------------------------- */

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 text-xs text-slate-500 md:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600">
            <Mic className="h-3 w-3 text-white" />
          </div>
          <span className="font-bold text-slate-900" style={HEADING}>Lunara</span>
          <span>© {new Date().getFullYear()} · Sovereign Voice AI</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 font-bold uppercase tracking-wider">
          <a href="#platform" className="hover:text-slate-900">Platform</a>
          <a href="#enterprise" className="hover:text-slate-900">On-Premise</a>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">Demo</a>
          <a href="mailto:hello@lunara.now" className="hover:text-slate-900">Contact</a>
        </div>
        <div className="text-[10px] uppercase tracking-widest">Built on Gemini Live · Twilio · SIP</div>
      </div>
    </footer>
  );
}
