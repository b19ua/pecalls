import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PhoneCall, Bot, BookOpen, Wrench, Globe2, Mic, Radio, BarChart3,
  PhoneIncoming, PhoneOutgoing, ShieldCheck, Zap, ArrowRight, Building2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lunara — AI Voice Agents for Phone Calls" },
      {
        name: "description",
        content:
          "Lunara is an AI voice calling platform: build agents that answer and place real phone calls, mirror the caller's language, use your knowledge base, and call your APIs in real time.",
      },
      { property: "og:title", content: "Lunara — AI Voice Agents for Phone Calls" },
      {
        property: "og:description",
        content:
          "Self-hosted voice AI on Gemini Live + Twilio. Inbound & outbound, RAG knowledge, live human handoff, webhook & CRM tools.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-elegant flex items-center justify-center">
              <Mic className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">Lunara</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#clients" className="hover:text-foreground transition-colors">Clients</a>
          </nav>
          <Button asChild size="sm" variant="outline">
            <a href="#clients">Client login</a>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, oklch(0.7 0.18 152) 0%, transparent 45%), radial-gradient(circle at 85% 60%, oklch(0.6 0.15 220) 0%, transparent 50%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            <Zap className="h-3.5 w-3.5" /> AI voice on real phone numbers
          </div>
          <h1 className="font-display mt-5 text-4xl sm:text-6xl font-bold leading-[1.05] tracking-tight">
            Voice AI agents that <span className="text-gradient-primary">actually pick up the phone</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Lunara is an end-to-end platform for building, deploying and operating AI voice agents
            on real telephony. They greet your callers, mirror their language, pull answers from your
            knowledge base, and trigger your APIs and CRM in real time.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-primary shadow-elegant">
              <a href="#features">
                See what it does <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">How it works</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Each client has a dedicated login URL — see <a href="#clients" className="underline">Our partners</a> below.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/60 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need to run AI on your phone lines
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built on Google Gemini Live (native audio) and Twilio. One platform for inbound,
              outbound, knowledge, tools, analytics and human handoff.
            </p>
          </div>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Feature icon={Bot} title="AI voice agents">
              Unlimited agents with custom greeting, system prompt up to 20k chars, 8 native voices,
              temperature control. Each agent has its own personality and goal.
            </Feature>
            <Feature icon={Globe2} title="Auto language mirroring">
              The agent automatically detects the caller's language and switches to it — Russian,
              Romanian, English and more — without lock-in.
            </Feature>
            <Feature icon={PhoneIncoming} title="Inbound calls">
              Point any Twilio number at your agent. Callers get a natural, sub-second voice
              experience powered by Gemini Live native audio.
            </Feature>
            <Feature icon={PhoneOutgoing} title="Outbound & campaigns">
              Place individual or bulk outbound calls. Use native Twilio numbers or your own SIP
              trunk to cut per-minute costs.
            </Feature>
            <Feature icon={BookOpen} title="RAG knowledge base">
              Upload PDFs, DOCX, MD or TXT per agent. We chunk, embed and inject the top matches
              into every call so answers stay grounded in your docs.
            </Feature>
            <Feature icon={Wrench} title="Tools: webhooks & CRM">
              Let the agent call your APIs mid-conversation — check order status, look up a customer
              in HubSpot / Salesforce / Bitrix, create leads and tickets.
            </Feature>
            <Feature icon={Radio} title="Live monitor & handoff">
              Watch active calls in real time. Hand off to a human agent the moment the conversation
              needs a person.
            </Feature>
            <Feature icon={BarChart3} title="Recordings & analytics">
              Dual-channel WAV recordings, transcripts, token usage, durations and per-agent
              dashboards. Every call is auditable.
            </Feature>
            <Feature icon={ShieldCheck} title="Self-hosted & private">
              Your numbers, your data, your prompts. A self-hosted alternative to Vapi / Retell /
              Bland with full control.
            </Feature>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border/60 bg-card/30 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            How a call flows through Lunara
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            One real-time pipeline from the caller's mouth to the AI's voice — and back.
          </p>

          <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Step n={1} title="Caller dials in / agent dials out">
              Twilio PSTN or SIP routes the call to our voice webhook.
            </Step>
            <Step n={2} title="Realtime bridge opens">
              A WebSocket streams audio between the call and Gemini Live with your agent's prompt,
              voice and knowledge.
            </Step>
            <Step n={3} title="Agent talks, tools fire">
              Gemini answers in the caller's language. When it needs data, it calls your webhooks or
              CRM tools and uses the result in the reply.
            </Step>
            <Step n={4} title="Logged & analyzable">
              Recording, transcript, tokens and status are saved. You can review, hand off, or feed
              outcomes back into your workflows.
            </Step>
          </div>
        </div>
      </section>

      {/* Clients */}
      <section id="clients" className="border-t border-border/60 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Our partners
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Each partner gets their own branded login URL on <code className="px-1 py-0.5 rounded bg-muted text-foreground">lunara.now</code>.
            All entrances lead into the same shared Lunara workspace.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <PartnerCard name="Premier Energy" slug="lunara.now/pm" to="/pm" />
            <PartnerCard name="StarNet" slug="lunara.now/sn" to="/sn" />

            <Card className="bg-gradient-card shadow-soft border-dashed border-border/60">
              <CardContent className="p-5 opacity-70">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold">Your company</div>
                    <div className="text-xs text-muted-foreground">lunara.now/your-slug</div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-muted-foreground">
                  New partner URLs are added on request.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60 py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <PhoneCall className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-display mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to put AI on your phone lines?
          </h2>
          <p className="mt-3 text-muted-foreground">
            If you already have a partner account, head to <a href="#clients" className="underline">Our partners</a> to sign in.
          </p>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} Lunara. All rights reserved.</div>
          <div>Built on Gemini Live & Twilio.</div>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon, title, children,
}: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-gradient-card shadow-soft border-border/60">
      <CardContent className="p-5">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-4 font-semibold">{title}</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{children}</p>
      </CardContent>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background p-5">
      <div className="h-8 w-8 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-sm">
        {n}
      </div>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function PartnerCard({ name, slug, to }: { name: string; slug: string; to: "/pm" | "/sn" }) {
  return (
    <Card className="bg-gradient-card shadow-soft border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold">{name}</div>
            <div className="text-xs text-muted-foreground">{slug}</div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link to={to}>Open login <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}
