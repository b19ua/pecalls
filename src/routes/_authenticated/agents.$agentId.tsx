import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { saveAgent, deleteAgent } from "@/lib/agents.functions";
import { provisionInboundSip, deleteInboundSip, syncTwilioNumbers, configureTwilioNumber, placeOutboundCall } from "@/lib/twilio.functions";
import { connectTelegramBot, disconnectTelegramBot } from "@/lib/telegram.functions";
import { GEMINI_VOICES, LANGUAGES } from "@/lib/voices";
import { PageHeader } from "@/components/PageHeader";
import { HintIcon } from "@/components/HintIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Save, Trash2, Loader2, PhoneCall, Wrench, BookOpen, ChevronDown, MessageCircle, Send, Instagram, Linkedin, Mail, RefreshCw, Upload, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";
import { TestCallDialog } from "@/components/TestCallDialog";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  component: AgentEditor,
});

type AgentForm = {
  name: string;
  description: string;
  greeting: string;
  system_prompt: string;
  voice: string;
  language: string;
  model: string;
  temperature: number;
  twilio_number_e164: string;
  inbound_connection_type: "phone" | "sip_uri";
  inbound_sip_uri_user: string;
  is_active: boolean;
  record_calls: boolean;
  silence_timeout_seconds: number;
  
  handoff_enabled: boolean;
  handoff_dtmf_digit: string;
  handoff_trigger_phrases: string[];
  handoff_numbers: string[];
  outbound_mode: "twilio_number" | "sip_trunk";
  telephony_provider: "twilio" | "asterisk";
  asterisk_ari_base_url: string;
  asterisk_ari_username: string;
  asterisk_ari_password: string;
  asterisk_ari_app: string;
  asterisk_audiosocket_host: string;
  asterisk_context: string;
  asterisk_caller_id: string;
  asterisk_trunk: string;
  asterisk_record_calls: boolean;
  sip_domain: string;
  sip_username: string;
  sip_password: string;
  sip_transport: "tls" | "tcp" | "udp";
  sip_from_number: string;
  sip_route_prefix: string;

  objection_handling_enabled: boolean;
  objection_aaa_enabled: boolean;
  objection_categories: string[];
  objection_custom_responses: Record<string, string>;
  emotion_tracking_enabled: boolean;
  tools_config: Record<string, boolean>;
};

const OBJECTION_CATEGORIES: { key: string; label: string; hint: string; placeholder: string }[] = [
  { key: "price", label: "💰 Цена / бюджет", hint: "«Дорого», «нет денег», «дешевле есть»", placeholder: "ROI окупается за 3 мес, есть рассрочка 0%..." },
  { key: "timing", label: "⏰ Тайминг", hint: "«Не сейчас», «позже», «занят»", placeholder: "Чем дольше ждём — тем дороже. 15 мин сейчас экономят..." },
  { key: "trust", label: "🤝 Доверие / авторитет", hint: "«Кто вы такие», «боюсь обмана»", placeholder: "Работаем с 2019, 200+ клиентов, кейс — ..." },
  { key: "competitor", label: "🔄 Конкурент", hint: "«Уже работаем с X»", placeholder: "Уважаем X. У нас отличает то, что..." },
  { key: "stall", label: "🤔 Откладывание", hint: "«Я подумаю», «пришлите на почту»", placeholder: "Конечно. Что именно хотите обдумать — цену или функционал?" },
  { key: "emotional", label: "😤 Эмоциональное", hint: "Раздражение, гнев", placeholder: "Понимаю ваши чувства, давайте разберёмся..." },
  { key: "clarification", label: "❓ Уточнение", hint: "Не понял, путаница", placeholder: "Поясню проще: ..." },
];

const DEFAULTS: AgentForm = {
  name: "",
  description: "",
  greeting: "Здравствуйте! Чем могу помочь?",
  system_prompt: "Ты вежливый ассистент Premier Energy. Отвечай кратко и по делу.",
  voice: "Puck",
  language: "ru-RU",
  model: "gemini-3.1-flash-live-preview",
  temperature: 0.8,
  twilio_number_e164: "",
  inbound_connection_type: "phone",
  inbound_sip_uri_user: "",
  is_active: true,
  record_calls: true,
  silence_timeout_seconds: 2,
  
  handoff_enabled: true,
  handoff_dtmf_digit: "0",
  handoff_trigger_phrases: ["соедини с менеджером", "оператор", "human", "manager"],
  handoff_numbers: [],
  outbound_mode: "twilio_number",
  telephony_provider: "twilio",
  asterisk_ari_base_url: "",
  asterisk_ari_username: "",
  asterisk_ari_password: "",
  asterisk_ari_app: "lunara",
  asterisk_audiosocket_host: "",
  asterisk_context: "from-lunara",
  asterisk_caller_id: "",
  asterisk_trunk: "",
  asterisk_record_calls: true,
  sip_domain: "",
  sip_username: "",
  sip_password: "",
  sip_transport: "tls",
  sip_from_number: "",
  sip_route_prefix: "",

  objection_handling_enabled: false,
  objection_aaa_enabled: true,
  objection_categories: ["price", "timing", "trust", "competitor", "stall", "emotional", "clarification"],
  objection_custom_responses: {},
  emotion_tracking_enabled: true,
  tools_config: { get_local_system_data: true, create_emergency_ticket: true },
};

function AgentEditor() {
  const { t } = useI18n();
  const { agentId } = useParams({ from: "/_authenticated/agents/$agentId" });
  const isNew = agentId === "new";
  const navigate = useNavigate();
  const saveAgentFn = useServerFn(saveAgent);
  const deleteAgentFn = useServerFn(deleteAgent);
  const provisionSipFn = useServerFn(provisionInboundSip);
  const deleteSipFn = useServerFn(deleteInboundSip);
  const syncNumbersFn = useServerFn(syncTwilioNumbers);
  const configureNumberFn = useServerFn(configureTwilioNumber);
  const outboundCallFn = useServerFn(placeOutboundCall);
  const [form, setForm] = useState<AgentForm>(DEFAULTS);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [inboundSip, setInboundSip] = useState<{ sip_domain: string; username: string; password: string } | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [twilioNumbers, setTwilioNumbers] = useState<Array<{ id: string; phone_e164: string; friendly_name: string | null; agent_id: string | null }>>([]);
  const [numbersLoading, setNumbersLoading] = useState(false);
  const [syncingNumbers, setSyncingNumbers] = useState(false);
  const [testToNumber, setTestToNumber] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkDialing, setBulkDialing] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [tgToken, setTgToken] = useState("");
  const [tgBusy, setTgBusy] = useState(false);
  const connectTelegramFn = useServerFn(connectTelegramBot);
  const disconnectTelegramFn = useServerFn(disconnectTelegramBot);

  useEffect(() => {
    if (isNew) return;
    supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error("404");
          navigate({ to: "/agents" });
          return;
        }
        setForm({
          name: data.name,
          description: data.description ?? "",
          greeting: data.greeting,
          system_prompt: data.system_prompt,
          voice: data.voice,
          language: data.language,
          model: data.model,
          temperature: Number(data.temperature),
          twilio_number_e164: data.twilio_number_e164 ?? "",
          inbound_connection_type: ((data as any).inbound_connection_type as "phone" | "sip_uri") ?? "phone",
          inbound_sip_uri_user: (data as any).inbound_sip_uri_user ?? "",
          is_active: data.is_active,
          record_calls: data.record_calls,
          silence_timeout_seconds: data.silence_timeout_seconds,
          
          handoff_enabled: data.handoff_enabled,
          handoff_dtmf_digit: data.handoff_dtmf_digit ?? "0",
          handoff_trigger_phrases: data.handoff_trigger_phrases ?? [],
          handoff_numbers: data.handoff_numbers ?? [],
          outbound_mode: (data.outbound_mode as "twilio_number" | "sip_trunk") ?? "twilio_number",
          sip_domain: data.sip_domain ?? "",
          sip_username: data.sip_username ?? "",
          sip_password: data.sip_password ?? "",
          sip_transport: (data.sip_transport as "tls" | "tcp" | "udp") ?? "tls",
          sip_from_number: data.sip_from_number ?? "",
          sip_route_prefix: data.sip_route_prefix ?? "",
          objection_handling_enabled: (data as any).objection_handling_enabled ?? false,
          objection_aaa_enabled: (data as any).objection_aaa_enabled ?? true,
          objection_categories: (data as any).objection_categories ?? DEFAULTS.objection_categories,
          objection_custom_responses: ((data as any).objection_custom_responses as Record<string, string>) ?? {},
          emotion_tracking_enabled: (data as any).emotion_tracking_enabled ?? true,
          tools_config: ((data as any).tools_config && typeof (data as any).tools_config === "object")
            ? { get_local_system_data: true, create_emergency_ticket: true, ...(data as any).tools_config }
            : DEFAULTS.tools_config,
        });
        if (data.inbound_sip_domain && data.inbound_sip_username && data.inbound_sip_password) {
          setInboundSip({
            sip_domain: data.inbound_sip_domain,
            username: data.inbound_sip_username,
            password: data.inbound_sip_password,
          });
        }
        setTelegramUsername((data as any).telegram_bot_username ?? null);
        setLoading(false);
      });
  }, [agentId, isNew, navigate]);

  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error(t("agent.field.name"));
      return;
    }
    const cleanedNumbers = form.handoff_numbers
      .map((s) => s.trim())
      .filter(Boolean);
    const badNumber = cleanedNumbers.find((s) => !/^\+?[0-9]{6,16}$/.test(s));
    if (badNumber) {
      toast.error(`Неверный номер: ${badNumber}`);
      return;
    }
    if (cleanedNumbers.length > 5) {
      toast.error("max 5");
      return;
    }
    form.handoff_numbers = cleanedNumbers;
    if (form.inbound_connection_type === "sip_uri") {
      const u = form.inbound_sip_uri_user.trim();
      if (!u) {
        toast.error("Укажите идентификатор SIP URI");
        return;
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(u)) {
        toast.error("SIP идентификатор: только латиница, цифры, . _ -");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await saveAgentFn({
        data: {
          id: isNew ? null : agentId,
          data: {
            ...form,
            description: form.description || null,
            twilio_number_e164: form.inbound_connection_type === "phone" ? (form.twilio_number_e164 || null) : null,
            inbound_connection_type: form.inbound_connection_type,
            inbound_sip_uri_user: form.inbound_connection_type === "sip_uri" ? (form.inbound_sip_uri_user.trim() || null) : null,
            sip_domain: form.sip_domain || null,
            sip_username: form.sip_username || null,
            sip_password: form.sip_password || null,
            sip_from_number: form.sip_from_number || null,
            sip_route_prefix: form.sip_route_prefix || null,
          },
        },
      });
      toast.success("OK");
      if (isNew) navigate({ to: "/agents/$agentId", params: { agentId: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("common.delete") + "?")) return;
    try {
      await deleteAgentFn({ data: { id: agentId } });
      toast.success("OK");
      navigate({ to: "/agents" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleProvisionSip() {
    if (isNew) {
      toast.error("Сначала сохраните агента");
      return;
    }
    setProvisioning(true);
    try {
      const res = await provisionSipFn({ data: { agentId } });
      setInboundSip({ sip_domain: res.sip_domain ?? "", username: res.username, password: res.password });
      toast.success("SIP домен создан");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось создать SIP");
    } finally {
      setProvisioning(false);
    }
  }

  async function handleDeleteSip() {
    if (!confirm("Удалить SIP-домен? Входящие звонки перестанут работать.")) return;
    setProvisioning(true);
    try {
      await deleteSipFn({ data: { agentId } });
      setInboundSip(null);
      toast.success("SIP-домен удалён");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка удаления");
    } finally {
      setProvisioning(false);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} скопировано`),
      () => toast.error("Не удалось скопировать"),
    );
  }

  function setOutboundMode(m: "twilio_number" | "sip_trunk") {
    setForm((p) => ({
      ...p,
      outbound_mode: m,
      inbound_connection_type: m === "twilio_number" ? "phone" : "sip_uri",
    }));
  }

  async function loadTwilioNumbers() {
    setNumbersLoading(true);
    const { data } = await supabase
      .from("twilio_numbers")
      .select("id,phone_e164,friendly_name,agent_id")
      .order("phone_e164");
    setTwilioNumbers(data ?? []);
    setNumbersLoading(false);
  }

  useEffect(() => {
    if (form.outbound_mode === "twilio_number" && !isNew) loadTwilioNumbers();
  }, [form.outbound_mode, isNew]);

  async function handleSyncNumbers() {
    setSyncingNumbers(true);
    try {
      const r = await syncNumbersFn({});
      toast.success(`Синхронизировано: ${r.synced}`);
      await loadTwilioNumbers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncingNumbers(false);
    }
  }

  async function handleAssignNumber(numberId: string) {
    if (isNew) { toast.error("Сначала сохраните агента"); return; }
    try {
      await configureNumberFn({ data: { numberId, agentId } });
      const num = twilioNumbers.find((n) => n.id === numberId);
      if (num) set("twilio_number_e164", num.phone_e164);
      toast.success("Номер привязан к агенту");
      await loadTwilioNumbers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assign failed");
    }
  }

  async function handleTestNumber() {
    if (isNew) { toast.error("Сначала сохраните агента"); return; }
    const to = testToNumber.trim();
    if (!/^\+?[0-9]{6,16}$/.test(to)) { toast.error("Введите корректный номер E.164"); return; }
    try {
      const r = await outboundCallFn({ data: { agentId, toNumber: to } });
      toast.success(`Тестовый звонок: ${r.sid}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Call failed");
    }
  }

  function parseBulkNumbers(text: string): string[] {
    return Array.from(
      new Set(
        text
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter((s) => /^\+?[0-9]{6,16}$/.test(s)),
      ),
    );
  }

  async function handleBulkDial() {
    if (isNew) { toast.error("Сначала сохраните агента"); return; }
    const nums = parseBulkNumbers(bulkText);
    if (!nums.length) { toast.error("Нет валидных номеров"); return; }
    if (!confirm(`Запустить ${nums.length} звонк(ов)?`)) return;
    setBulkDialing(true);
    let ok = 0, fail = 0;
    for (const n of nums) {
      try { await outboundCallFn({ data: { agentId, toNumber: n } }); ok++; }
      catch { fail++; }
    }
    setBulkDialing(false);
    toast.success(`Запущено: ${ok}, ошибок: ${fail}`);
  }

  function handleBulkCsv(file: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      setBulkText(text);
      toast.success(`Импортировано ${parseBulkNumbers(text).length} номеров`);
    };
    reader.readAsText(file);
  }

  async function handleConnectTelegram() {
    if (isNew) { toast.error("Сначала сохраните агента"); return; }
    const token = tgToken.trim();
    if (!token) { toast.error("Введите токен от @BotFather"); return; }
    setTgBusy(true);
    try {
      const res = await connectTelegramFn({ data: { agentId, token } });
      setTelegramUsername(res.username);
      setTgToken("");
      toast.success(`Подключено: @${res.username}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось подключить");
    } finally {
      setTgBusy(false);
    }
  }

  async function handleDisconnectTelegram() {
    if (!confirm("Отключить Telegram бота?")) return;
    setTgBusy(true);
    try {
      await disconnectTelegramFn({ data: { agentId } });
      setTelegramUsername(null);
      toast.success("Telegram отключён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setTgBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/agents"><ArrowLeft className="h-4 w-4 mr-1" /> {t("agent.backToList")}</Link>
      </Button>
      <PageHeader
        title={isNew ? t("agent.title.new") : form.name || t("nav.agents")}
        description={t("agent.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            {!isNew && (
              <Button variant="outline" onClick={() => setTestOpen(true)}>
                <PhoneCall className="h-4 w-4 mr-1.5" /> {t("agent.testCall")}
              </Button>
            )}
            {!isNew && (
              <Button variant="outline" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1.5" /> {t("common.delete")}
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving} className="bg-gradient-primary shadow-elegant">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {t("common.save")}
            </Button>
          </div>
        }
      />

      <div className="space-y-5">
        <Section title={t("agent.section.basic")}>
          <Field label={t("agent.field.name")}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Premier Support" />
          </Field>
          <Field label={t("agent.field.description")}>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </Field>
          <div className="flex items-center justify-between">
            <Label>{t("agent.field.active")}</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
          </div>
        </Section>

        <Section title={t("agent.section.voice")}>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label={t("agent.field.voice")}>
              <Select value={form.voice} onValueChange={(v) => set("voice", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GEMINI_VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} — {v.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("agent.field.language")}>
              <Select value={form.language} onValueChange={(v) => set("language", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={`${t("agent.field.temperature")}: ${form.temperature.toFixed(2)}`}>
            <Slider value={[form.temperature]} min={0} max={1.5} step={0.05} onValueChange={(v) => set("temperature", v[0])} />
          </Field>
        </Section>

        <Section title={t("agent.section.behavior")}>
          <Field label={t("agent.field.greeting")} hint={t("agent.hint.greeting")}>
            <Textarea value={form.greeting} onChange={(e) => set("greeting", e.target.value)} rows={2} />
          </Field>
          <Field label={t("agent.field.systemPrompt")} hint={t("agent.hint.systemPrompt")}>
            <Textarea value={form.system_prompt} onChange={(e) => set("system_prompt", e.target.value)} rows={6} />
          </Field>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h4 className="font-medium text-sm">База знаний (RAG)</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Загрузите PDF / DOCX / TXT / MD — документы будут разбиты на чанки, проиндексированы
              эмбеддингами Gemini и автоматически подмешаны в контекст ассистента во время звонка
              (top-k поиск по смыслу).
            </p>
            {!isNew ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/knowledge" search={{ agent: agentId } as never}>
                  <BookOpen className="h-4 w-4 mr-1.5" /> Открыть базу знаний агента
                </Link>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Сначала сохраните агента.</p>
            )}
          </div>
        </Section>

        <CollapsibleSection title="🎯 Динамическая работа с возражениями + эмоции" defaultOpen={form.objection_handling_enabled}>
          <div className="flex items-start justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="text-sm">
              <div className="font-medium">Dynamic Objection Handling</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                ИИ распознаёт возражения клиента (цена, тайминг, доверие, конкурент, «подумаю», эмоции),
                отвечает по фреймворку AAA (Acknowledge → Ask → Answer), и логирует каждый случай для
                аналитики и обучения. Можно настроить кастомные ответы на топ-возражения вашего продукта.
              </p>
            </div>
            <Switch checked={form.objection_handling_enabled} onCheckedChange={(v) => set("objection_handling_enabled", v)} />
          </div>

          {form.objection_handling_enabled && (
            <>
              <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
                <div>
                  <Label className="text-sm">AAA-фреймворк (Acknowledge → Ask → Answer)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Сначала валидировать чувство, потом уточнить, потом контр-аргумент.</p>
                </div>
                <Switch checked={form.objection_aaa_enabled} onCheckedChange={(v) => set("objection_aaa_enabled", v)} />
              </div>

              <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
                <div>
                  <Label className="text-sm">Трекинг эмоций клиента</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">ИИ непрерывно отслеживает тон (спокойствие / любопытство / раздражение / гнев) и адаптирует ответ.</p>
                </div>
                <Switch checked={form.emotion_tracking_enabled} onCheckedChange={(v) => set("emotion_tracking_enabled", v)} />
              </div>

              <Field label="Активные категории возражений" hint="Отключите ненужные. Активные категории ИИ детектирует и логирует.">
                <div className="grid sm:grid-cols-2 gap-2">
                  {OBJECTION_CATEGORIES.map((c) => {
                    const active = form.objection_categories.includes(c.key);
                    return (
                      <label key={c.key} className={`flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition ${active ? "border-primary/40 bg-primary/5" : "border-border/50"}`}>
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.objection_categories, c.key]
                              : form.objection_categories.filter((k) => k !== c.key);
                            set("objection_categories", next);
                          }}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{c.label}</div>
                          <div className="text-xs text-muted-foreground">{c.hint}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Field>

              <Field label="Кастомные контр-аргументы" hint="Подскажите ИИ, какой именно угол использовать в ответ на каждое возражение (специфика вашего продукта/цен/кейсов). Оставьте пустым — ИИ будет импровизировать.">
                <div className="space-y-2">
                  {OBJECTION_CATEGORIES.filter((c) => form.objection_categories.includes(c.key)).map((c) => (
                    <div key={c.key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{c.label}</Label>
                      <Textarea
                        rows={2}
                        placeholder={c.placeholder}
                        value={form.objection_custom_responses[c.key] ?? ""}
                        onChange={(e) =>
                          set("objection_custom_responses", { ...form.objection_custom_responses, [c.key]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                </div>
              </Field>

              <div className="rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
                💡 После каждого звонка возражения и эмоции логируются в таблицу <code>objection_events</code>.
                Используйте раздел Analytics, чтобы видеть топ возражений, win-rate по категориям и какие тактики
                реально закрывают сделки.
              </div>
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="🧰 Локальные инструменты (Data Residency)" defaultOpen={false}>
          <p className="text-xs text-muted-foreground">
            Включите инструменты, которые этот агент имеет право вызывать во время звонка.
            Настройки самих CRM (URL, HMAC, таймауты) — в разделе <code>/data-residency</code>.
          </p>
          <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
            <div>
              <Label className="text-sm">get_local_system_data (CRM #1 — чтение клиента)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Разрешить ИИ запрашивать данные клиента по номеру телефона из локальной CRM.</p>
            </div>
            <Switch
              checked={form.tools_config.get_local_system_data !== false}
              onCheckedChange={(v) => set("tools_config", { ...form.tools_config, get_local_system_data: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
            <div>
              <Label className="text-sm">create_emergency_ticket (CRM #2 — создание аварийной заявки)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Разрешить ИИ создавать аварийные заявки об отключении света.</p>
            </div>
            <Switch
              checked={form.tools_config.create_emergency_ticket !== false}
              onCheckedChange={(v) => set("tools_config", { ...form.tools_config, create_emergency_ticket: v })}
            />
          </div>
        </CollapsibleSection>


        <CollapsibleSection title={t("agent.section.telephony")} defaultOpen>
          <Field label="Маршрут звонка" hint="Применяется ко всем звонкам — и входящим, и исходящим.">
            <Select value={form.outbound_mode} onValueChange={(v) => setOutboundMode(v as "twilio_number" | "sip_trunk")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio_number">Twilio номер</SelectItem>
                <SelectItem value="sip_trunk">Свой SIP trunk</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
            <Label className="text-sm">{t("agent.field.record")}</Label>
            <Switch checked={form.record_calls} onCheckedChange={(v) => set("record_calls", v)} />
          </div>

          {form.outbound_mode === "twilio_number" ? (
            <>
              <div className="space-y-3 rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-medium text-sm">Номера Twilio</h4>
                  <Button type="button" size="sm" variant="outline" onClick={handleSyncNumbers} disabled={syncingNumbers}>
                    {syncingNumbers ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Синхронизировать
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Выберите номер Twilio — он будет использоваться и для входящих, и для исходящих звонков агента. Активный номер: <code className="font-mono">{form.twilio_number_e164 || "—"}</code>
                </p>
                {numbersLoading ? (
                  <p className="text-xs text-muted-foreground">Загрузка…</p>
                ) : twilioNumbers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Нет номеров. Нажмите «Синхронизировать», чтобы импортировать из аккаунта Twilio.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-border/50">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Номер</th>
                          <th className="text-left px-3 py-2 font-medium">Имя</th>
                          <th className="text-left px-3 py-2 font-medium">Статус</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {twilioNumbers.map((n) => {
                          const mine = n.agent_id === agentId;
                          const taken = !!n.agent_id && !mine;
                          return (
                            <tr key={n.id} className="border-t border-border/40">
                              <td className="px-3 py-2 font-mono">{n.phone_e164}</td>
                              <td className="px-3 py-2 text-muted-foreground">{n.friendly_name || "—"}</td>
                              <td className="px-3 py-2 text-xs">
                                {mine ? <span className="text-success">✓ этот агент</span> : taken ? <span className="text-muted-foreground">занят</span> : <span className="text-muted-foreground">свободен</span>}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {mine ? (
                                  <span className="text-xs text-success">Активен</span>
                                ) : (
                                  <Button size="sm" variant="outline" disabled={taken} onClick={() => handleAssignNumber(n.id)}>
                                    Подключить
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="rounded-md border border-border/40 p-3 space-y-2">
                  <Label className="text-xs text-muted-foreground">Тест номера</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={testToNumber}
                      onChange={(e) => setTestToNumber(e.target.value)}
                      placeholder="+37360123456"
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handleTestNumber} disabled={isNew || !form.twilio_number_e164}>
                      <PhoneOutgoing className="h-3.5 w-3.5 mr-1.5" /> Позвонить
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Агент позвонит на указанный номер с привязанного Twilio номера.</p>
                </div>
              </div>

              <BulkOutboundBlock
                bulkText={bulkText}
                onChange={setBulkText}
                onCsv={handleBulkCsv}
                onDial={handleBulkDial}
                busy={bulkDialing}
                disabled={isNew || !form.twilio_number_e164}
                hint="Звонки уйдут с привязанного Twilio номера."
              />
            </>
          ) : (
            <>
              <div className="space-y-3 rounded-lg border border-border/60 p-4">
                <h4 className="font-medium text-sm">Входящие через SIP</h4>
                <p className="text-xs text-muted-foreground">
                  Выберите способ приёма входящих: ваш SIP-номер (PSTN через провайдера) или SIP URI напрямую на агента.
                </p>

                <Field label="Тип входящего подключения">
                  <Select
                    value={form.inbound_connection_type}
                    onValueChange={(v) => set("inbound_connection_type", v as "phone" | "sip_uri")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">Свой SIP-номер (PSTN)</SelectItem>
                      <SelectItem value="sip_uri">SIP URI (прямое подключение)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {form.inbound_connection_type === "sip_uri" ? (
                  <>
                    <Field label="SIP URI идентификатор" hint="латиница, цифры, . _ -">
                      <Input
                        value={form.inbound_sip_uri_user}
                        onChange={(e) => set("inbound_sip_uri_user", e.target.value)}
                        placeholder="agent-name"
                      />
                    </Field>
                    {form.inbound_sip_uri_user && (
                      <div className="flex items-start justify-between gap-3 rounded-md bg-muted/40 p-2">
                        <div className="min-w-0 flex-1">
                          <Label className="text-xs text-muted-foreground">Полный SIP URI</Label>
                          <code className="block font-mono text-xs mt-0.5 break-all">
                            sip:{form.inbound_sip_uri_user}@{inboundSip?.sip_domain || "<создайте SIP-домен ниже>"}
                          </code>
                        </div>
                        {inboundSip?.sip_domain && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0"
                            onClick={() => copy(`sip:${form.inbound_sip_uri_user}@${inboundSip.sip_domain}`, "SIP URI")}>Copy</Button>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Передайте этот URI вашему SIP-провайдеру / софтфону — звонки на него попадут напрямую к агенту.
                    </p>
                  </>
                ) : (
                  <>
                    <Field label="Ваш входящий SIP-номер (E.164)" hint="номер, который провайдер будет слать на агента">
                      <Input
                        value={form.twilio_number_e164}
                        onChange={(e) => set("twilio_number_e164", e.target.value)}
                        placeholder="+37360123456"
                      />
                    </Field>
                    <p className="text-xs text-muted-foreground">
                      Ваш PBX/провайдер должен пересылать вызовы на этот номер в SIP-домен ниже (после создания). Логин/пароль — из карточки credentials.
                    </p>
                  </>
                )}



                {inboundSip ? (
                  <div className="space-y-3">
                    {[
                      { label: "SIP host", value: inboundSip.sip_domain },
                      { label: "Username", value: inboundSip.username },
                      { label: "Password", value: inboundSip.password },
                      { label: "Transport", value: "TLS 5061 (или UDP/TCP 5060)" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <Label className="text-xs text-muted-foreground">{row.label}</Label>
                          <code className="block font-mono text-xs mt-0.5 break-all">{row.value}</code>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => copy(row.value, row.label)}>Copy</Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={handleProvisionSip} disabled={provisioning}>
                        {provisioning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Обновить webhook
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={handleDeleteSip} disabled={provisioning}>Удалить SIP</Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" size="sm" onClick={handleProvisionSip} disabled={provisioning || isNew}>
                    {provisioning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Создать SIP-домен
                  </Button>
                )}
              </div>


              <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <h4 className="font-medium text-sm">Исходящий SIP trunk</h4>
                <p className="text-xs text-muted-foreground">
                  Звонки уйдут через ваш SIP-провайдер. Если провайдер ждёт E.164 — оставьте Route prefix пустым.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="SIP домен" hint="например gpg.vgtele.com">
                    <Input value={form.sip_domain} onChange={(e) => set("sip_domain", e.target.value)} placeholder="gpg.vgtele.com" />
                  </Field>
                  <Field label="Transport">
                    <Select value={form.sip_transport} onValueChange={(v) => set("sip_transport", v as "tls" | "tcp" | "udp")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tls">TLS (рекомендуется)</SelectItem>
                        <SelectItem value="tcp">TCP</SelectItem>
                        <SelectItem value="udp">UDP</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="SIP username">
                    <Input value={form.sip_username} onChange={(e) => set("sip_username", e.target.value)} autoComplete="off" />
                  </Field>
                  <Field label="SIP password">
                    <Input type="password" value={form.sip_password} onChange={(e) => set("sip_password", e.target.value)} autoComplete="new-password" />
                  </Field>
                  <Field label="Caller ID (опц.)">
                    <Input value={form.sip_from_number} onChange={(e) => set("sip_from_number", e.target.value)} placeholder="+37360123456" />
                  </Field>
                  <Field label="Route prefix (опц.)" hint="Например 88">
                    <Input value={form.sip_route_prefix} onChange={(e) => set("sip_route_prefix", e.target.value)} placeholder="88" />
                  </Field>
                </div>
              </div>

              <BulkOutboundBlock
                bulkText={bulkText}
                onChange={setBulkText}
                onCsv={handleBulkCsv}
                onDial={handleBulkDial}
                busy={bulkDialing}
                disabled={isNew || !form.sip_domain}
                hint="Звонки уйдут через подключённый SIP trunk."
              />
            </>
          )}

          <div className="space-y-3 rounded-lg border border-border/60 p-4">
            <h4 className="font-medium text-sm">Human Handoff</h4>
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-sm">
                {t("agent.field.handoffOn")} <HintIcon text={t("agent.hint.handoff")} />
              </Label>
              <Switch checked={form.handoff_enabled} onCheckedChange={(v) => set("handoff_enabled", v)} />
            </div>
            <Field label={t("agent.field.dtmf")}>
              <Input maxLength={1} value={form.handoff_dtmf_digit} onChange={(e) => set("handoff_dtmf_digit", e.target.value)} className="w-24" />
            </Field>
            <Field label={t("agent.field.phrases")}>
              <Textarea
                rows={2}
                value={form.handoff_trigger_phrases.join(", ")}
                onChange={(e) => set("handoff_trigger_phrases", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              />
            </Field>
            <Field label={t("agent.field.numbers")} hint="E.164 формат. Пример: +37360111111">
              <Textarea
                rows={4}
                placeholder="+37360111111&#10;+37360222222"
                value={form.handoff_numbers.join("\n")}
                onChange={(e) => set("handoff_numbers", e.target.value.split(/[\n,]+/).map((s) => s.replace(/[^\d+]/g, "")))}
                onBlur={(e) => set("handoff_numbers", e.target.value.split(/[\n,]+/).map((s) => s.trim()).filter((s) => /^\+?[0-9]{6,16}$/.test(s)))}
              />
              {form.handoff_numbers.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {form.handoff_numbers.map((n, i) => {
                    const ok = /^\+?[0-9]{6,16}$/.test(n);
                    return (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${ok ? "bg-success/10 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
                        {ok ? "✓" : "⚠"} {n || "(пусто)"}
                      </span>
                    );
                  })}
                </div>
              )}
            </Field>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Texting">
          <p className="text-sm text-muted-foreground">
            Подключите каналы переписки — агент сможет отвечать клиентам в выбранных мессенджерах.
          </p>
          <div className="rounded-lg border border-[#229ED9]/30 bg-[#229ED9]/5 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg border bg-[#229ED9]/10 text-[#229ED9] border-[#229ED9]/30 flex items-center justify-center shrink-0">
                <Send className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">Telegram Bot</div>
                <div className="text-xs text-muted-foreground">
                  {telegramUsername ? (
                    <>Подключён: <a href={`https://t.me/${telegramUsername}`} target="_blank" rel="noreferrer" className="text-[#229ED9] hover:underline">@{telegramUsername}</a></>
                  ) : (
                    <>Создайте бота у <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-[#229ED9] hover:underline">@BotFather</a> и вставьте токен ниже.</>
                  )}
                </div>
              </div>
              {telegramUsername && (
                <Button type="button" variant="outline" size="sm" onClick={handleDisconnectTelegram} disabled={tgBusy}>
                  {tgBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Отключить"}
                </Button>
              )}
            </div>
            {!telegramUsername && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                  placeholder="123456789:AAH..."
                  autoComplete="off"
                  className="flex-1 font-mono text-xs"
                />
                <Button type="button" size="sm" onClick={handleConnectTelegram} disabled={tgBusy || isNew} className="bg-[#229ED9] hover:bg-[#1d8fc4] text-white">
                  {tgBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Подключить
                </Button>
              </div>
            )}
            {isNew && <p className="text-xs text-muted-foreground">Сначала сохраните агента.</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <ChannelCard
              name="WhatsApp"
              description="Business API"
              icon={<MessageCircle className="h-5 w-5" />}
              brandClass="bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30"
              onConnect={() => toast.info("Скоро: WhatsApp")}
            />
            <ChannelCard
              name="Instagram"
              description="Direct Messages"
              icon={<Instagram className="h-5 w-5" />}
              brandClass="bg-[#E1306C]/10 text-[#E1306C] border-[#E1306C]/30"
              onConnect={() => toast.info("Скоро: Instagram DM")}
            />
            <ChannelCard
              name="LinkedIn"
              description="Сообщения"
              icon={<Linkedin className="h-5 w-5" />}
              brandClass="bg-[#0A66C2]/10 text-[#0A66C2] border-[#0A66C2]/30"
              onConnect={() => toast.info("Скоро: LinkedIn")}
            />
            <ChannelCard
              name="Gmail"
              description="Email-ответы"
              icon={<Mail className="h-5 w-5" />}
              brandClass="bg-[#EA4335]/10 text-[#EA4335] border-[#EA4335]/30"
              onConnect={() => toast.info("Скоро: Gmail")}
            />
          </div>
        </CollapsibleSection>

        <Section title="Инструменты">
          <p className="text-sm text-muted-foreground">
            Подключите webhook и CRM-инструменты, которые ассистент будет использовать во время разговора.
          </p>
          <Button asChild variant="outline">
            <Link to="/tools"><Wrench className="h-4 w-4 mr-1.5" /> Открыть инструменты</Link>
          </Button>
        </Section>



      </div>

      {!isNew && (
        <TestCallDialog
          agentId={agentId}
          agentName={form.name || "Agent"}
          open={testOpen}
          onOpenChange={setTestOpen}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-gradient-card shadow-soft">
      <CardContent className="p-4 sm:p-6 space-y-4">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <Separator />
        {children}
      </CardContent>
    </Card>
  );
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="bg-gradient-card shadow-soft">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <CollapsibleTrigger className="flex w-full items-center justify-between group">
            <h3 className="font-display text-lg font-semibold">{title}</h3>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 data-[state=open]:pt-1">
            <Separator />
            {children}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}


function BulkOutboundBlock({ bulkText, onChange, onCsv, onDial, busy, disabled, hint }: {
  bulkText: string;
  onChange: (v: string) => void;
  onCsv: (file: File) => void;
  onDial: () => void;
  busy: boolean;
  disabled: boolean;
  hint: string;
}) {
  const count = bulkText.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^\+?[0-9]{6,16}$/.test(s)).length;
  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-medium text-sm">Массовые исходящие звонки</h4>
        <span className="text-xs text-muted-foreground">Валидных номеров: {count}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint} Загрузите CSV или вставьте номера через запятую / с новой строки.</p>
      <Textarea
        rows={5}
        placeholder="+37360111111, +37360222222&#10;+37360333333"
        value={bulkText}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex">
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ""; }}
          />
          <span className="inline-flex items-center text-xs px-3 py-2 rounded-md border border-border/60 hover:bg-muted/40 cursor-pointer">
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Загрузить CSV
          </span>
        </label>
        <Button type="button" size="sm" onClick={onDial} disabled={disabled || busy || count === 0} className="bg-gradient-primary">
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <PhoneOutgoing className="h-3.5 w-3.5 mr-1.5" />}
          Запустить звонки
        </Button>
      </div>
    </div>
  );
}

function ChannelCard({ name, description, icon, brandClass, onConnect }: { name: string; description: string; icon: React.ReactNode; brandClass: string; onConnect: () => void }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4 flex items-center gap-3 hover:border-primary/40 transition-colors">
      <div className={`h-10 w-10 rounded-lg border flex items-center justify-center shrink-0 ${brandClass}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{name}</div>
        <div className="text-xs text-muted-foreground truncate">{description}</div>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onConnect}>Подключить</Button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm flex items-center gap-1.5">
        {label}
        {hint && <HintIcon text={hint} />}
      </Label>
      {children}
    </div>
  );
}
