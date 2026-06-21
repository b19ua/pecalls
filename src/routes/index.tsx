import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Mic, MessageSquare, Activity, ShieldCheck, BookOpen,
  Plug, Megaphone, FileBarChart, PhoneCall, Lock, Zap, Server, Globe2,
  CheckCircle2, Sparkles, Wand2, Building2, Plus,
} from "lucide-react";

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

function LandingPage() {
  return (
    <div
      className="min-h-screen w-full bg-[#1a1a2e] text-[#f8fafc] selection:bg-[#4ade80]/30"
      style={BODY}
    >
      <Nav />
      <Hero />
      <BentoFeatures />
      <Pipeline />
      <Enterprise />
      <Comparison />
      <Partners />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ----------------------------- Nav ----------------------------- */

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#1a1a2e]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-10">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4ade80] shadow-[0_0_20px_rgba(74,222,128,0.4)]">
              <Mic className="h-4 w-4 text-[#1a1a2e]" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white" style={HEADING}>
              Lunara
            </span>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-slate-400 lg:flex">
            <a href="#platform" className="transition-colors hover:text-[#4ade80]">Platform</a>
            <a href="#monitor" className="transition-colors hover:text-[#4ade80]">Live Monitor</a>
            <a href="#copilot" className="transition-colors hover:text-[#4ade80]">Copilot</a>
            <a href="#compliance" className="transition-colors hover:text-[#4ade80]">Compliance</a>
            <a href="#enterprise" className="transition-colors hover:text-[#4ade80]">On-Premise</a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LangSwitcher />
          <Link
            to="/auth"
            className="hidden rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition-all hover:bg-white/5 sm:inline-block"
          >
            Client login
          </Link>
          <a
            href="#cta"
            className="rounded-full bg-[#4ade80] px-5 py-2.5 text-sm font-bold text-[#1a1a2e] shadow-[0_0_20px_rgba(74,222,128,0.25)] transition-all hover:brightness-110"
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
    <div className="hidden items-center rounded-full border border-white/10 bg-[#16213e] px-2 py-1 text-xs font-bold md:flex">
      {items.map((code, i) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`px-2 py-0.5 uppercase transition-colors ${
            lang === code ? "text-[#4ade80]" : "text-slate-500 hover:text-white"
          } ${i > 0 ? "border-l border-white/10" : ""}`}
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
        <div className="absolute -left-[10%] -top-[10%] h-[55%] w-[55%] rounded-full bg-[#a78bfa]/10 blur-[140px]" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[45%] w-[45%] rounded-full bg-[#4ade80]/10 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-1 text-xs font-bold text-[#4ade80]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4ade80]" />
            </span>
            ON-PREMISE VOICE AI · ENTERPRISE STACK
          </div>

          <h1
            className="mb-8 text-5xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl lg:text-7xl"
            style={HEADING}
          >
            Voice AI on{" "}
            <span className="bg-gradient-to-r from-[#4ade80] to-[#a78bfa] bg-clip-text text-transparent">
              your own
            </span>{" "}
            infrastructure.
          </h1>

          <p className="mb-10 max-w-xl text-lg leading-relaxed text-slate-400">
            Deploy high-fidelity AI agents behind your firewall. Your servers, your phone numbers,
            your data — full sovereign control with sub-second Gemini Live latency, AI Copilot for
            human managers and a real-time compliance engine.
          </p>

          <div className="flex flex-wrap gap-4">
            <a
              href="#cta"
              className="inline-flex items-center gap-2 rounded-xl bg-[#4ade80] px-7 py-4 text-base font-bold text-[#1a1a2e] transition-transform hover:scale-[1.02]"
            >
              Book a live demo
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href="#platform"
              className="rounded-xl border border-white/10 bg-white/5 px-7 py-4 text-base font-bold text-white backdrop-blur-sm transition-all hover:bg-white/10"
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
      <div className="mx-auto mt-24 flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm font-bold tracking-wider text-slate-500">
        <span>GEMINI LIVE</span>
        <span className="opacity-30">·</span>
        <span>SIP &amp; TWILIO</span>
        <span className="opacity-30">·</span>
        <span>ON-PREMISE</span>
        <span className="opacity-30">·</span>
        <span>EU DATA RESIDENCY</span>
        <span className="opacity-30">·</span>
        <span>SOC 2 READY</span>
        <span className="opacity-30">·</span>
        <span>BYOK / BYO-SIP</span>
      </div>
    </section>
  );
}

function LiveCallMockup() {
  const bars = [10, 18, 12, 22, 8, 16, 20, 14, 10, 24, 12, 18, 10];
  return (
    <div className="relative">
      <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-[#4ade80]/20 to-[#a78bfa]/20 blur-2xl" />
      <div className="relative rounded-3xl border border-white/10 bg-[#16213e]/85 p-7 shadow-2xl backdrop-blur-2xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Active Call · #4931
            </p>
            <h3 className="mt-1 text-xl font-bold text-white" style={HEADING}>
              Inbound · Premier Energy
            </h3>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            RISK · HIGH 82%
          </div>
        </div>

        {/* Waveform */}
        <div className="mb-8 flex h-24 items-center justify-center gap-1 px-2">
          {bars.map((h, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-full ${i % 5 === 3 ? "bg-[#a78bfa]" : "bg-[#4ade80]"}`}
              style={{
                height: `${h * 3}px`,
                animation: `pulse 1.${i % 6}s ease-in-out ${i * 60}ms infinite`,
              }}
            />
          ))}
        </div>

        {/* Customer line */}
        <div className="mb-4 rounded-2xl rounded-tl-none border border-white/5 bg-white/5 p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Customer
          </p>
          <p className="text-sm italic text-slate-200">
            “Look, I want my money back today or I'm cancelling everything.”
          </p>
        </div>

        {/* AI Copilot whisper */}
        <div className="rounded-2xl rounded-tr-none border border-[#a78bfa]/30 bg-[#a78bfa]/10 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#a78bfa]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#a78bfa]">
              AI Copilot whisper
            </span>
          </div>
          <p className="text-sm font-medium text-slate-100">
            Offer a 20% credit toward next renewal instead of a cash refund. Mention 14-day
            retention window from playbook §3.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#4ade80]" /> Gemini Live
          </span>
          <span>Sentiment · Negative</span>
          <span className="flex items-center gap-1.5">
            Twilio PSTN <span className="h-2 w-2 rounded-full bg-[#4ade80]" />
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
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#4ade80]">
            The platform
          </p>
          <h2 className="mb-4 text-4xl font-bold text-white md:text-5xl" style={HEADING}>
            Everything you need for enterprise Voice AI.
          </h2>
          <p className="text-lg text-slate-400">
            One stack for autonomous AI agents, human-led calls with Copilot, supervisor oversight,
            compliance, knowledge and analytics. Nothing leaves your perimeter.
          </p>
        </div>

        <div className="grid auto-rows-[180px] grid-cols-1 gap-5 md:grid-cols-4 lg:grid-cols-6">
          {/* AI Voice Agents — large */}
          <BentoTile className="md:col-span-2 md:row-span-2 lg:col-span-3" accent="green">
            <BentoIcon color="green"><Mic className="h-5 w-5" /></BentoIcon>
            <h3 className="text-2xl font-bold text-white" style={HEADING}>AI Voice Agents</h3>
            <p className="mt-3 max-w-md text-slate-400">
              Gemini Live native audio with sub-second latency. 8 human voices, auto language
              mirroring across EN / RO / RU and 30+ more, 20k-character system prompts and
              per-agent personalities.
            </p>
            <Tags items={["native-audio", "auto-mirror", "low-latency"]} />
          </BentoTile>

          {/* AI Copilot — large */}
          <BentoTile id="copilot" className="md:col-span-2 md:row-span-2 lg:col-span-3" accent="violet">
            <BentoIcon color="violet"><MessageSquare className="h-5 w-5" /></BentoIcon>
            <h3 className="text-2xl font-bold text-white" style={HEADING}>AI Copilot for Managers</h3>
            <p className="mt-3 max-w-md text-slate-400">
              Your human team stays on the line — the AI listens and whispers the next-best answer,
              objection handler or upsell. Live transcript, sentiment and source citations,
              streaming as the conversation unfolds.
            </p>
            <Tags items={["real-time whisper", "playbooks", "augmented agent"]} />
          </BentoTile>

          {/* Live Monitor — medium with mini dashboard */}
          <BentoTile id="monitor" className="md:col-span-2 md:row-span-2 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-lg font-bold text-white" style={HEADING}>Live Supervisor Monitor</h4>
              <Activity className="h-4 w-4 text-[#4ade80]" />
            </div>
            <p className="mb-4 text-xs text-slate-400">
              Risk scoring across every active call. Whisper to managers. Take over instantly.
            </p>
            <div className="space-y-2">
              <RiskRow label="AI · #4928" tone="green" status="Normal" />
              <RiskRow label="Copilot · #4930" tone="amber" status="Amber" />
              <RiskRow label="AI · #4931" tone="red" status="Take over" />
            </div>
          </BentoTile>

          {/* Compliance — medium with checklist */}
          <BentoTile id="compliance" className="md:col-span-2 md:row-span-2 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-lg font-bold text-white" style={HEADING}>Compliance Engine</h4>
              <ShieldCheck className="h-4 w-4 text-[#4ade80]" />
            </div>
            <p className="mb-4 text-xs text-slate-400">
              Must-say / must-not-say rules. Instant flags. Correction suggested in real time.
            </p>
            <div className="space-y-2 text-xs">
              <CheckRow text="Recording disclosure read" ok />
              <CheckRow text="GDPR opt-out mentioned" ok />
              <CheckRow text="“Guaranteed returns” — blocked" violation />
              <CheckRow text="Risk warning statement" pending />
            </div>
          </BentoTile>

          {/* On-Premise highlight tile */}
          <BentoTile className="md:col-span-2 md:row-span-2 lg:col-span-2" accent="green">
            <BentoIcon color="green"><Server className="h-5 w-5" /></BentoIcon>
            <h4 className="text-lg font-bold text-white" style={HEADING}>On-Premise &amp; Sovereign</h4>
            <p className="mt-2 text-sm text-slate-400">
              Deploy inside your VPC or bare metal. Your SIP, your LLM keys, your Postgres. Zero
              data leaves your network — ever.
            </p>
            <Tags items={["BYOK", "BYO-SIP", "EU residency"]} />
          </BentoTile>

          {/* RAG */}
          <BentoTile className="md:col-span-1 lg:col-span-2">
            <BentoIcon color="green"><BookOpen className="h-4 w-4" /></BentoIcon>
            <h5 className="text-base font-bold text-white" style={HEADING}>RAG Knowledge Base</h5>
            <p className="mt-1 text-xs text-slate-400">
              PDF, DOCX, MD per agent. Chunked, embedded, top-matches injected on every call.
            </p>
          </BentoTile>

          {/* Tools */}
          <BentoTile className="md:col-span-1 lg:col-span-2">
            <BentoIcon color="violet"><Plug className="h-4 w-4" /></BentoIcon>
            <h5 className="text-base font-bold text-white" style={HEADING}>Tools &amp; Webhooks</h5>
            <p className="mt-1 text-xs text-slate-400">
              Mid-call calls to HubSpot, Salesforce, Bitrix, or any private API. Function-calling
              with schema validation.
            </p>
          </BentoTile>

          {/* Inbound + Outbound + Campaigns */}
          <BentoTile className="md:col-span-2 lg:col-span-2">
            <BentoIcon color="green"><Megaphone className="h-4 w-4" /></BentoIcon>
            <h5 className="text-base font-bold text-white" style={HEADING}>Inbound, Outbound &amp; Campaigns</h5>
            <p className="mt-1 text-xs text-slate-400">
              Point any number at an agent. Bulk dial CSVs with rate-limits, retries and timezone
              windows.
            </p>
          </BentoTile>

          {/* Post-call summaries */}
          <BentoTile className="md:col-span-2 lg:col-span-3">
            <BentoIcon color="violet"><FileBarChart className="h-4 w-4" /></BentoIcon>
            <h5 className="text-base font-bold text-white" style={HEADING}>Post-Call Intelligence</h5>
            <p className="mt-1 text-xs text-slate-400">
              Auto summary, sentiment arc, top objections, coaching score and next-step recommendation
              the moment the call ends. Powered by Gemini Flash.
            </p>
          </BentoTile>

          {/* Test call CTA */}
          <BentoTile className="md:col-span-2 lg:col-span-3" highlight>
            <div className="flex h-full flex-col justify-between">
              <div>
                <BentoIcon color="dark"><PhoneCall className="h-4 w-4" /></BentoIcon>
                <h5 className="mt-2 text-lg font-bold text-[#1a1a2e]" style={HEADING}>
                  Test Call — call yourself in 5 seconds.
                </h5>
                <p className="mt-1 text-xs font-medium text-[#1a1a2e]/80">
                  Type your number, hit go. The AI rings you, you talk to it, transcripts stream
                  into the dashboard live.
                </p>
              </div>
              <a
                href="#cta"
                className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg bg-[#1a1a2e] px-4 py-2 text-xs font-bold text-white transition-transform hover:scale-[1.02]"
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
    accent === "green" ? "hover:border-[#4ade80]/40"
    : accent === "violet" ? "hover:border-[#a78bfa]/40"
    : "hover:border-white/20";
  if (highlight) {
    return (
      <div id={id} className={`relative overflow-hidden rounded-3xl bg-[#4ade80] p-6 ${className}`}>
        {children}
      </div>
    );
  }
  return (
    <div
      id={id}
      className={`relative overflow-hidden rounded-3xl border border-white/5 bg-[#16213e] p-6 transition-all ${borderHover} ${className}`}
    >
      {accent === "green" && (
        <div className="pointer-events-none absolute -right-12 -bottom-12 h-44 w-44 rounded-full bg-[#4ade80]/8 blur-3xl" />
      )}
      {accent === "violet" && (
        <div className="pointer-events-none absolute -right-12 -bottom-12 h-44 w-44 rounded-full bg-[#a78bfa]/8 blur-3xl" />
      )}
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </div>
  );
}

function BentoIcon({ color, children }: { color: "green" | "violet" | "dark"; children: React.ReactNode }) {
  const cls =
    color === "green" ? "bg-[#4ade80]/10 text-[#4ade80]"
    : color === "violet" ? "bg-[#a78bfa]/10 text-[#a78bfa]"
    : "bg-[#1a1a2e] text-[#4ade80]";
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
        <span key={t} className="rounded border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {t}
        </span>
      ))}
    </div>
  );
}

function RiskRow({ label, tone, status }: { label: string; tone: "green" | "amber" | "red"; status: string }) {
  const map = {
    green: { dot: "bg-[#4ade80]", chip: "bg-[#4ade80]/15 text-[#4ade80]", border: "border-white/5" },
    amber: { dot: "bg-amber-400", chip: "bg-amber-400/15 text-amber-400", border: "border-amber-500/20" },
    red:   { dot: "bg-red-500 animate-pulse", chip: "bg-red-500/15 text-red-400", border: "border-red-500/30 bg-red-500/5" },
  }[tone];
  return (
    <div className={`flex items-center justify-between rounded-lg border ${map.border} bg-white/[0.03] px-3 py-2`}>
      <span className="flex items-center gap-2 text-xs font-medium text-slate-200">
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
    <div className="flex items-center gap-2 text-[#4ade80]"><CheckCircle2 className="h-3.5 w-3.5" />{text}</div>
  );
  if (violation) return (
    <div className="flex items-center gap-2 text-red-400"><span className="grid h-3.5 w-3.5 place-items-center rounded-sm bg-red-500/20 text-[10px] font-bold">!</span>{text}</div>
  );
  if (pending) return (
    <div className="flex items-center gap-2 text-slate-500"><span className="h-3.5 w-3.5 rounded-sm border border-white/15" />{text}</div>
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
    <section className="bg-[#16213e]/30 px-6 py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#a78bfa]">How it works</p>
          <h2 className="mb-4 text-4xl font-bold text-white" style={HEADING}>The real-time pipeline.</h2>
          <p className="text-slate-400">From the caller's mouth to your CRM and back, in milliseconds.</p>
        </div>
        <div className="relative grid gap-8 md:grid-cols-4">
          <div className="absolute left-[6%] right-[6%] top-6 hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent md:block" />
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="relative z-10 mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#1a1a2e] font-bold text-[#4ade80]" style={HEADING}>
                {s.n}
              </div>
              <h4 className="mb-2 text-lg font-bold text-white" style={HEADING}>{s.t}</h4>
              <p className="text-sm leading-relaxed text-slate-400" dangerouslySetInnerHTML={{ __html: s.b }} />
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
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#4ade80]">Built for enterprise</p>
            <h2 className="text-4xl font-bold text-white md:text-5xl" style={HEADING}>
              Your numbers. Your data. Your prompts.
            </h2>
          </div>
          <p className="text-lg text-slate-400">
            Lunara was built for regulated industries — energy, telecom, finance, healthcare — that
            simply cannot ship customer audio to a third-party SaaS. So we don't.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.t} className="rounded-2xl border border-white/5 bg-[#16213e] p-7 transition-colors hover:border-white/15">
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#4ade80]/10 text-[#4ade80]">
                <it.icon className="h-5 w-5" />
              </div>
              <h4 className="mb-2 text-lg font-bold text-white" style={HEADING}>{it.t}</h4>
              <p className="text-sm leading-relaxed text-slate-400">{it.b}</p>
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
    <section className="px-6 py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#a78bfa]">The comparison</p>
          <h2 className="text-4xl font-bold text-white md:text-5xl" style={HEADING}>
            The self-hosted alternative to Vapi, Retell &amp; Bland.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-400">
            Same Gemini-grade conversation quality. None of the data-leaving-your-perimeter
            problem.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/5 bg-[#16213e]">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-white/5 px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
            <span>Capability</span>
            <span className="w-24 text-center text-[#4ade80]">Lunara</span>
            <span className="w-24 text-center">SaaS voice AI</span>
          </div>
          {rows.map((r, i) => (
            <div
              key={r.feat}
              className={`grid grid-cols-[1fr_auto_auto] items-center gap-6 px-6 py-4 text-sm ${
                i % 2 === 1 ? "bg-white/[0.02]" : ""
              }`}
            >
              <span className="text-slate-200">{r.feat}</span>
              <span className="w-24 text-center">
                <CheckCircle2 className="mx-auto h-5 w-5 text-[#4ade80]" />
              </span>
              <span className="w-24 text-center text-slate-500">
                {r.others === true ? <CheckCircle2 className="mx-auto h-5 w-5" /> : r.others === "partial" ? "partial" : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------- Partners -------------------------- */

function Partners() {
  return (
    <section className="border-t border-white/5 px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <p className="mb-10 text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
          Powering high-volume operations
        </p>
        <div className="grid gap-5 md:grid-cols-3">
          <PartnerCard name="Premier Energy" slug="lunara.now/pm" sub="Enterprise portal · inbound + outbound" />
          <PartnerCard name="StarNet" slug="lunara.now/sn" sub="Customer service · AI + Copilot" />
          <PartnerCard name="Your company" slug="lunara.now/your-slug" sub="New partner URLs added on request" empty />
        </div>
      </div>
    </section>
  );
}

function PartnerCard({ name, slug, sub, empty }: { name: string; slug: string; sub: string; empty?: boolean }) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl border p-6 ${empty ? "border-dashed border-white/10 bg-transparent opacity-70" : "border-white/5 bg-[#16213e]"}`}>
      <div className={`grid h-12 w-12 place-items-center rounded-xl ${empty ? "bg-white/5 text-slate-500" : "bg-[#4ade80]/10 text-[#4ade80]"}`}>
        {empty ? <Plus className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold text-white" style={HEADING}>{name}</p>
        <p className="truncate text-xs text-slate-500">{slug}</p>
        <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>
      </div>
      {!empty && (
        <Link to="/auth" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 transition-colors hover:bg-white/5">
          Open
        </Link>
      )}
    </div>
  );
}

/* --------------------------- Final CTA -------------------------- */

function FinalCta() {
  return (
    <section id="cta" className="px-6 py-28">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[#16213e] via-[#1a1a2e] to-[#16213e] p-1">
        <div className="relative rounded-[calc(2.5rem-4px)] bg-[#1a1a2e] px-8 py-20 text-center">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-40 w-[60%] -translate-x-1/2 rounded-full bg-[#4ade80]/15 blur-[100px]" />
          </div>
          <div className="relative z-10">
            <div className="mx-auto mb-8 grid h-16 w-16 place-items-center rounded-2xl bg-[#4ade80] text-[#1a1a2e] shadow-[0_0_40px_rgba(74,222,128,0.4)]">
              <Wand2 className="h-7 w-7" />
            </div>
            <h2 className="mb-5 text-4xl font-bold text-white md:text-5xl" style={HEADING}>
              Put AI on your phone lines this quarter.
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-lg text-slate-400">
              Book a 30-minute architecture review. We'll spin up a sandbox in your tenant and
              ring your phone with a real agent before the call ends.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a href="mailto:hello@lunara.now" className="rounded-xl bg-[#4ade80] px-8 py-4 font-bold text-[#1a1a2e] transition-transform hover:scale-[1.02]">
                Book a live demo
              </a>
              <Link to="/auth" className="rounded-xl border border-white/10 bg-white/5 px-8 py-4 font-bold text-white transition-all hover:bg-white/10">
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
    <footer className="border-t border-white/5 px-6 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 text-xs text-slate-500 md:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#4ade80]">
            <Mic className="h-3 w-3 text-[#1a1a2e]" />
          </div>
          <span className="font-bold text-white" style={HEADING}>Lunara</span>
          <span>© {new Date().getFullYear()} · Sovereign Voice AI</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 font-bold uppercase tracking-wider">
          <a href="#platform" className="hover:text-white">Platform</a>
          <a href="#enterprise" className="hover:text-white">On-Premise</a>
          <a href="#cta" className="hover:text-white">Demo</a>
          <a href="mailto:hello@lunara.now" className="hover:text-white">Contact</a>
        </div>
        <div className="text-[10px] uppercase tracking-widest">Built on Gemini Live · Twilio · SIP</div>
      </div>
    </footer>
  );
}
