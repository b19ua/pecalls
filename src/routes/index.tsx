import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PhoneCall, Bot, BookOpen, Wrench, Globe2, Mic, Radio, BarChart3,
  PhoneIncoming, PhoneOutgoing, ShieldCheck, Zap, ArrowRight, Building2,
  Sparkles,
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

/* ----------------------------- i18n (local) ----------------------------- */

type Lang = "en" | "ro" | "ru";

const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "en", label: "English",  flag: "🇬🇧" },
  { code: "ro", label: "Română",   flag: "🇷🇴" },
  { code: "ru", label: "Русский",  flag: "🇷🇺" },
];

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    "nav.features": "Features",
    "nav.how": "How it works",
    "nav.partners": "Partners",
    "nav.login": "Client login",
    "hero.badge": "AI voice on real phone numbers",
    "hero.title1": "Voice AI agents that",
    "hero.title2": "actually pick up the phone",
    "hero.sub": "Lunara is an end-to-end platform for building, deploying and operating AI voice agents on real telephony. They greet your callers, mirror their language, pull answers from your knowledge base, and trigger your APIs and CRM in real time.",
    "hero.cta1": "See what it does",
    "hero.cta2": "How it works",
    "hero.note": "Each client has a dedicated login URL — see Our partners below.",
    "hero.live": "Live call in progress",
    "f.title": "Everything you need to run AI on your phone lines",
    "f.sub": "Built on Google Gemini Live (native audio) and Twilio. One platform for inbound, outbound, knowledge, tools, analytics and human handoff.",
    "f.agents.t": "AI voice agents",
    "f.agents.b": "Unlimited agents with custom greeting, system prompt up to 20k chars, 8 native voices, temperature control.",
    "f.lang.t": "Auto language mirroring",
    "f.lang.b": "The agent detects the caller's language and switches automatically — Russian, Romanian, English and more.",
    "f.in.t": "Inbound calls",
    "f.in.b": "Point any Twilio number at your agent. Sub-second voice powered by Gemini Live native audio.",
    "f.out.t": "Outbound & campaigns",
    "f.out.b": "Place individual or bulk outbound calls. Use Twilio numbers or your own SIP trunk.",
    "f.rag.t": "RAG knowledge base",
    "f.rag.b": "Upload PDFs, DOCX, MD or TXT per agent. We chunk, embed and inject the top matches into every call.",
    "f.tools.t": "Tools: webhooks & CRM",
    "f.tools.b": "Let the agent call your APIs mid-call — order status, HubSpot / Salesforce / Bitrix lookups, leads, tickets.",
    "f.live.t": "Live monitor & handoff",
    "f.live.b": "Watch active calls in real time. Hand off to a human the moment the conversation needs a person.",
    "f.an.t": "Recordings & analytics",
    "f.an.b": "Dual-channel recordings, transcripts, token usage, durations and per-agent dashboards.",
    "f.self.t": "Self-hosted & private",
    "f.self.b": "Your numbers, your data, your prompts. A self-hosted alternative to Vapi / Retell / Bland.",
    "h.title": "How a call flows through Lunara",
    "h.sub": "One real-time pipeline from the caller's mouth to the AI's voice — and back.",
    "h.s1.t": "Caller dials in / agent dials out",
    "h.s1.b": "Twilio PSTN or SIP routes the call to our voice webhook.",
    "h.s2.t": "Realtime bridge opens",
    "h.s2.b": "A WebSocket streams audio between the call and Gemini Live with your prompt, voice and knowledge.",
    "h.s3.t": "Agent talks, tools fire",
    "h.s3.b": "Gemini answers in the caller's language. When it needs data, it calls your webhooks or CRM tools.",
    "h.s4.t": "Logged & analyzable",
    "h.s4.b": "Recording, transcript, tokens and status are saved. Review, hand off, or feed outcomes back.",
    "p.title": "Our partners",
    "p.sub": "Each partner gets their own branded login URL on lunara.now. All entrances lead into the same shared Lunara workspace.",
    "p.your": "Your company",
    "p.yourSub": "New partner URLs are added on request.",
    "p.open": "Open login",
    "cta.title": "Ready to put AI on your phone lines?",
    "cta.sub": "If you already have a partner account, head to Our partners to sign in.",
    "ft.rights": "All rights reserved.",
    "ft.built": "Built on Gemini Live & Twilio.",
  },
  ro: {
    "nav.features": "Funcții",
    "nav.how": "Cum funcționează",
    "nav.partners": "Parteneri",
    "nav.login": "Autentificare client",
    "hero.badge": "AI vocal pe numere de telefon reale",
    "hero.title1": "Agenți vocali AI care",
    "hero.title2": "chiar răspund la telefon",
    "hero.sub": "Lunara este o platformă completă pentru a construi, lansa și opera agenți vocali AI pe telefonie reală. Salută apelanții, le oglindesc limba, răspund din baza ta de cunoștințe și apelează API-urile și CRM-ul tău în timp real.",
    "hero.cta1": "Vezi ce poate face",
    "hero.cta2": "Cum funcționează",
    "hero.note": "Fiecare client are un URL dedicat de autentificare — vezi Partenerii noștri mai jos.",
    "hero.live": "Apel live în desfășurare",
    "f.title": "Tot ce ai nevoie pentru a rula AI pe liniile tale telefonice",
    "f.sub": "Construit pe Google Gemini Live (audio nativ) și Twilio. O singură platformă pentru inbound, outbound, cunoștințe, instrumente, analitică și transfer la operator uman.",
    "f.agents.t": "Agenți vocali AI",
    "f.agents.b": "Agenți nelimitați cu salut personalizat, prompt până la 20k caractere, 8 voci native, control de temperatură.",
    "f.lang.t": "Oglindire automată a limbii",
    "f.lang.b": "Agentul detectează limba apelantului și comută automat — rusă, română, engleză și altele.",
    "f.in.t": "Apeluri primite",
    "f.in.b": "Direcționează orice număr Twilio către agentul tău. Voce sub o secundă pe Gemini Live audio nativ.",
    "f.out.t": "Apeluri ieșite & campanii",
    "f.out.b": "Apeluri individuale sau în masă. Folosește numere Twilio sau propriul trunchi SIP.",
    "f.rag.t": "Bază de cunoștințe RAG",
    "f.rag.b": "Încarcă PDF, DOCX, MD sau TXT per agent. Le împărțim, le indexăm și injectăm cele mai bune potriviri în fiecare apel.",
    "f.tools.t": "Instrumente: webhook-uri & CRM",
    "f.tools.b": "Agentul îți apelează API-urile în timpul conversației — status comandă, căutări HubSpot / Salesforce / Bitrix, lead-uri, tichete.",
    "f.live.t": "Monitor live & transfer",
    "f.live.b": "Vezi apelurile active în timp real. Predă către un om exact când conversația o cere.",
    "f.an.t": "Înregistrări & analitică",
    "f.an.b": "Înregistrări pe canale duale, transcrieri, consum token, durate și dashboard-uri per agent.",
    "f.self.t": "Self-hosted & privat",
    "f.self.b": "Numerele tale, datele tale, prompturile tale. Alternativă self-hosted la Vapi / Retell / Bland.",
    "h.title": "Cum trece un apel prin Lunara",
    "h.sub": "O singură conductă în timp real, de la gura apelantului la vocea AI — și înapoi.",
    "h.s1.t": "Apelantul sună / agentul sună",
    "h.s1.b": "Twilio PSTN sau SIP direcționează apelul către webhook-ul nostru de voce.",
    "h.s2.t": "Se deschide bridge-ul realtime",
    "h.s2.b": "Un WebSocket transmite audio între apel și Gemini Live cu promptul, vocea și cunoștințele tale.",
    "h.s3.t": "Agentul vorbește, instrumentele rulează",
    "h.s3.b": "Gemini răspunde în limba apelantului. Când are nevoie de date, apelează webhook-urile sau CRM-ul tău.",
    "h.s4.t": "Înregistrat & analizabil",
    "h.s4.b": "Înregistrare, transcriere, tokeni și status sunt salvate. Revizuiește, transferă sau reutilizează rezultatele.",
    "p.title": "Partenerii noștri",
    "p.sub": "Fiecare partener are propriul URL de autentificare brandat pe lunara.now. Toate intrările duc în același workspace Lunara.",
    "p.your": "Compania ta",
    "p.yourSub": "URL-uri noi pentru parteneri sunt adăugate la cerere.",
    "p.open": "Deschide login",
    "cta.title": "Gata să pui AI pe liniile tale telefonice?",
    "cta.sub": "Dacă ai deja cont de partener, mergi la Partenerii noștri pentru autentificare.",
    "ft.rights": "Toate drepturile rezervate.",
    "ft.built": "Construit pe Gemini Live & Twilio.",
  },
  ru: {
    "nav.features": "Возможности",
    "nav.how": "Как это работает",
    "nav.partners": "Партнёры",
    "nav.login": "Вход для клиентов",
    "hero.badge": "ИИ-голос на реальных телефонных номерах",
    "hero.title1": "Голосовые ИИ-агенты, которые",
    "hero.title2": "реально берут трубку",
    "hero.sub": "Lunara — это платформа для создания, запуска и эксплуатации голосовых ИИ-агентов на настоящей телефонии. Они здороваются с клиентом, переходят на его язык, отвечают из вашей базы знаний и дёргают ваши API и CRM в реальном времени.",
    "hero.cta1": "Посмотреть возможности",
    "hero.cta2": "Как это работает",
    "hero.note": "У каждого клиента — свой URL для входа. См. раздел «Наши партнёры» ниже.",
    "hero.live": "Идёт активный звонок",
    "f.title": "Всё, что нужно, чтобы запустить ИИ на ваших телефонных линиях",
    "f.sub": "На базе Google Gemini Live (native audio) и Twilio. Одна платформа для входящих, исходящих, базы знаний, инструментов, аналитики и перевода на оператора.",
    "f.agents.t": "Голосовые ИИ-агенты",
    "f.agents.b": "Неограниченное число агентов, кастомное приветствие, промпт до 20k символов, 8 нативных голосов, температура.",
    "f.lang.t": "Автопереключение языка",
    "f.lang.b": "Агент определяет язык собеседника и переключается автоматически — русский, румынский, английский и другие.",
    "f.in.t": "Входящие звонки",
    "f.in.b": "Направьте любой номер Twilio на агента. Голос с задержкой меньше секунды на Gemini Live.",
    "f.out.t": "Исходящие и кампании",
    "f.out.b": "Одиночные и массовые исходящие. Номера Twilio или ваш SIP-транк.",
    "f.rag.t": "База знаний RAG",
    "f.rag.b": "Загружайте PDF, DOCX, MD, TXT для каждого агента. Мы режем, индексируем и подмешиваем релевантные куски в каждый звонок.",
    "f.tools.t": "Инструменты: вебхуки и CRM",
    "f.tools.b": "Агент дёргает ваши API прямо в разговоре — статус заказа, поиск в HubSpot / Salesforce / Bitrix, лиды и тикеты.",
    "f.live.t": "Live-монитор и перевод",
    "f.live.b": "Смотрите активные звонки в реальном времени. Передайте оператору ровно в нужный момент.",
    "f.an.t": "Записи и аналитика",
    "f.an.b": "Двухканальные записи, транскрипты, расход токенов, длительности и дашборды по агентам.",
    "f.self.t": "Self-hosted и приватность",
    "f.self.b": "Ваши номера, ваши данные, ваши промпты. Self-hosted-альтернатива Vapi / Retell / Bland.",
    "h.title": "Как звонок проходит через Lunara",
    "h.sub": "Один realtime-пайплайн от голоса клиента до голоса ИИ — и обратно.",
    "h.s1.t": "Клиент звонит / агент звонит",
    "h.s1.b": "Twilio PSTN или SIP направляет звонок на наш голосовой webhook.",
    "h.s2.t": "Открывается realtime-мост",
    "h.s2.b": "WebSocket стримит аудио между звонком и Gemini Live с вашим промптом, голосом и знаниями.",
    "h.s3.t": "Агент говорит, инструменты срабатывают",
    "h.s3.b": "Gemini отвечает на языке собеседника. Когда нужны данные — дёргает ваши вебхуки или CRM.",
    "h.s4.t": "Логируется и анализируется",
    "h.s4.b": "Запись, транскрипт, токены и статус сохраняются. Можно просмотреть, передать оператору или передать дальше.",
    "p.title": "Наши партнёры",
    "p.sub": "У каждого партнёра — свой брендированный URL входа на lunara.now. Все входы ведут в один общий рабочий стол Lunara.",
    "p.your": "Ваша компания",
    "p.yourSub": "Новые партнёрские URL добавляются по запросу.",
    "p.open": "Открыть вход",
    "cta.title": "Готовы поставить ИИ на свои телефонные линии?",
    "cta.sub": "Если у вас уже есть партнёрский аккаунт, перейдите в раздел «Наши партнёры», чтобы войти.",
    "ft.rights": "Все права защищены.",
    "ft.built": "Построено на Gemini Live & Twilio.",
  },
};

const LS_KEY = "lunara.landing.lang";

function useLandingLang() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as Lang | null;
      if (saved && DICT[saved]) { setLang(saved); return; }
      const nav = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
      if (nav === "ru" || nav === "ro") setLang(nav as Lang);
    } catch {}
  }, []);
  const change = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem(LS_KEY, l); } catch {}
  };
  const t = useMemo(() => (k: string) => DICT[lang][k] ?? DICT.en[k] ?? k, [lang]);
  return { lang, setLang: change, t };
}

/* ----------------------------- Page ----------------------------- */

function LandingPage() {
  const { lang, setLang, t } = useLandingLang();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 animate-rise-in">
            <div className="relative h-9 w-9 rounded-xl bg-gradient-primary shadow-elegant flex items-center justify-center">
              <Mic className="h-4 w-4 text-primary-foreground" />
              <span className="absolute inset-0 rounded-xl bg-primary/40 animate-pulse-ring" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">Lunara</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors story-link">{t("nav.features")}</a>
            <a href="#how" className="hover:text-foreground transition-colors story-link">{t("nav.how")}</a>
            <a href="#clients" className="hover:text-foreground transition-colors story-link">{t("nav.partners")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <SelectTrigger className="h-9 w-[125px] bg-background/70 backdrop-blur">
                <Globe2 className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    <span className="mr-1.5">{l.flag}</span>{l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild size="sm" className="bg-gradient-primary shadow-elegant">
              <Link to="/login">{t("nav.login")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Animated blobs */}
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-primary/25 blur-3xl animate-blob" />
          <div className="absolute top-20 -right-32 h-[460px] w-[460px] rounded-full bg-[oklch(0.65_0.16_220)]/25 blur-3xl animate-blob" style={{ animationDelay: "-6s" }} />
          <div className="absolute -bottom-40 left-1/3 h-[380px] w-[380px] rounded-full bg-[oklch(0.7_0.18_160)]/25 blur-3xl animate-blob" style={{ animationDelay: "-12s" }} />
        </div>
        {/* Grid pattern */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-28">
          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold animate-rise-in">
                <Sparkles className="h-3.5 w-3.5" /> {t("hero.badge")}
              </div>
              <h1 className="font-display mt-5 text-4xl sm:text-6xl font-bold leading-[1.05] tracking-tight animate-rise-in delay-100">
                {t("hero.title1")}{" "}
                <span className="text-gradient-primary animate-gradient">{t("hero.title2")}</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed animate-rise-in delay-200">
                {t("hero.sub")}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3 animate-rise-in delay-300">
                <Button asChild size="lg" className="bg-gradient-primary shadow-elegant hover-scale">
                  <a href="#features">
                    {t("hero.cta1")} <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="hover-scale">
                  <a href="#how">{t("hero.cta2")}</a>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground animate-rise-in delay-400">
                {t("hero.note")}
              </p>
            </div>

            {/* Live call mockup */}
            <div className="relative animate-rise-in delay-200">
              <CallMockup label={t("hero.live")} />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative border-t border-border/60 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">{t("f.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("f.sub")}</p>
          </div>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Bot,           t: t("f.agents.t"), b: t("f.agents.b") },
              { icon: Globe2,        t: t("f.lang.t"),   b: t("f.lang.b") },
              { icon: PhoneIncoming, t: t("f.in.t"),     b: t("f.in.b") },
              { icon: PhoneOutgoing, t: t("f.out.t"),    b: t("f.out.b") },
              { icon: BookOpen,      t: t("f.rag.t"),    b: t("f.rag.b") },
              { icon: Wrench,        t: t("f.tools.t"),  b: t("f.tools.b") },
              { icon: Radio,         t: t("f.live.t"),   b: t("f.live.b") },
              { icon: BarChart3,     t: t("f.an.t"),     b: t("f.an.b") },
              { icon: ShieldCheck,   t: t("f.self.t"),   b: t("f.self.b") },
            ].map((f, i) => (
              <Feature key={i} icon={f.icon} title={f.t} delayIdx={i}>{f.b}</Feature>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative border-t border-border/60 bg-card/30 py-16 sm:py-24 overflow-hidden">
        <div aria-hidden className="absolute -top-20 right-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl animate-blob" />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">{t("h.title")}</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">{t("h.sub")}</p>

          <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { t: t("h.s1.t"), b: t("h.s1.b") },
              { t: t("h.s2.t"), b: t("h.s2.b") },
              { t: t("h.s3.t"), b: t("h.s3.b") },
              { t: t("h.s4.t"), b: t("h.s4.b") },
            ].map((s, i) => (
              <Step key={i} n={i + 1} title={s.t} delayIdx={i}>{s.b}</Step>
            ))}
          </div>
        </div>
      </section>

      {/* Clients */}
      <section id="clients" className="border-t border-border/60 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">{t("p.title")}</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">{t("p.sub")}</p>

          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <PartnerCard name="Premier Energy" slug="lunara.now/pm" to="/pm" delayIdx={0} openLabel={t("p.open")} />
            <PartnerCard name="StarNet"        slug="lunara.now/sn" to="/sn" delayIdx={1} openLabel={t("p.open")} />

            <Card className="bg-gradient-card shadow-soft border-dashed border-border/60 animate-rise-in delay-300">
              <CardContent className="p-5 opacity-70">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold">{t("p.your")}</div>
                    <div className="text-xs text-muted-foreground">lunara.now/your-slug</div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-muted-foreground">{t("p.yourSub")}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60 py-16 sm:py-20 relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-gradient-primary opacity-10 animate-gradient" />
        <div className="relative max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <div className="inline-flex">
            <div className="relative">
              <PhoneCall className="h-10 w-10 text-primary animate-float-slow" />
              <span className="absolute inset-0 rounded-full bg-primary/30 animate-pulse-ring" />
            </div>
          </div>
          <h2 className="font-display mt-4 text-3xl sm:text-4xl font-bold tracking-tight">{t("cta.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("cta.sub")}</p>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} Lunara. {t("ft.rights")}</div>
          <div>{t("ft.built")}</div>
        </div>
      </footer>
    </div>
  );
}

/* ----------------------------- Bits ----------------------------- */

function Feature({
  icon: Icon, title, children, delayIdx = 0,
}: { icon: any; title: string; children: React.ReactNode; delayIdx?: number }) {
  return (
    <Card
      className="group bg-gradient-card shadow-soft border-border/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant animate-rise-in"
      style={{ animationDelay: `${0.05 * delayIdx}s` }}
    >
      <CardContent className="p-5">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-4 font-semibold">{title}</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{children}</p>
      </CardContent>
    </Card>
  );
}

function Step({
  n, title, children, delayIdx = 0,
}: { n: number; title: string; children: React.ReactNode; delayIdx?: number }) {
  return (
    <div
      className="relative rounded-2xl border border-border/60 bg-background p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant animate-rise-in"
      style={{ animationDelay: `${0.08 * delayIdx}s` }}
    >
      <div className="h-8 w-8 rounded-full bg-gradient-primary text-primary-foreground font-bold flex items-center justify-center text-sm shadow-elegant">
        {n}
      </div>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function PartnerCard({
  name, slug, to, delayIdx = 0, openLabel,
}: { name: string; slug: string; to: "/pm" | "/sn"; delayIdx?: number; openLabel: string }) {
  return (
    <Card
      className="group bg-gradient-card shadow-soft border-border/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant animate-rise-in"
      style={{ animationDelay: `${0.08 * delayIdx}s` }}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold">{name}</div>
            <div className="text-xs text-muted-foreground">{slug}</div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="mt-4 w-full hover-scale">
          <Link to={to}>{openLabel} <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CallMockup({ label }: { label: string }) {
  return (
    <div className="relative mx-auto max-w-sm">
      {/* Glow */}
      <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-gradient-primary opacity-20 blur-2xl animate-gradient" />
      <div className="relative rounded-3xl border border-border/60 bg-background/80 backdrop-blur-xl shadow-elegant p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-pulse-ring" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">00:42</span>
        </div>

        {/* Voice bars */}
        <div className="mt-5 flex items-end justify-center gap-1.5 h-20">
          {Array.from({ length: 22 }).map((_, i) => (
            <span
              key={i}
              className="w-1.5 rounded-full bg-gradient-primary"
              style={{
                height: `${20 + Math.abs(Math.sin(i * 0.9)) * 70}%`,
                animation: `float-slow ${1 + (i % 5) * 0.18}s ease-in-out ${i * 0.05}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Transcript bubbles */}
        <div className="mt-5 space-y-2.5">
          <Bubble side="left">Bună ziua, sunt Lunara. Cu ce vă pot ajuta?</Bubble>
          <Bubble side="right">Hi, I want to check my order status.</Bubble>
          <Bubble side="left">Sure — one moment, checking your order…</Bubble>
        </div>

        <div className="mt-5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3 text-primary" /> Gemini Live</span>
          <span className="inline-flex items-center gap-1"><PhoneCall className="h-3 w-3 text-primary" /> Twilio PSTN</span>
        </div>
      </div>
    </div>
  );
}

function Bubble({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  return (
    <div className={`flex ${side === "right" ? "justify-end" : "justify-start"} animate-rise-in`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
          side === "right"
            ? "bg-gradient-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
