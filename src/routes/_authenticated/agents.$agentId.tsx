import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { saveAgent, deleteAgent } from "@/lib/agents.functions";
import { provisionInboundSip, deleteInboundSip } from "@/lib/twilio.functions";
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
import { ArrowLeft, Save, Trash2, Loader2, PhoneCall } from "lucide-react";
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
  is_active: boolean;
  record_calls: boolean;
  silence_timeout_seconds: number;
  max_call_seconds: number;
  handoff_enabled: boolean;
  handoff_dtmf_digit: string;
  handoff_trigger_phrases: string[];
  handoff_numbers: string[];
  outbound_mode: "twilio_number" | "sip_trunk";
  sip_domain: string;
  sip_username: string;
  sip_password: string;
  sip_transport: "tls" | "tcp" | "udp";
  sip_from_number: string;
  sip_route_prefix: string;
};

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
  is_active: true,
  record_calls: true,
  silence_timeout_seconds: 2,
  max_call_seconds: 600,
  handoff_enabled: true,
  handoff_dtmf_digit: "0",
  handoff_trigger_phrases: ["соедини с менеджером", "оператор", "human", "manager"],
  handoff_numbers: [],
  outbound_mode: "twilio_number",
  sip_domain: "",
  sip_username: "",
  sip_password: "",
  sip_transport: "tls",
  sip_from_number: "",
  sip_route_prefix: "",
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
  const [form, setForm] = useState<AgentForm>(DEFAULTS);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [inboundSip, setInboundSip] = useState<{ sip_domain: string; username: string; password: string } | null>(null);
  const [provisioning, setProvisioning] = useState(false);

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
          is_active: data.is_active,
          record_calls: data.record_calls,
          silence_timeout_seconds: data.silence_timeout_seconds,
          max_call_seconds: data.max_call_seconds,
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
        });
        if (data.inbound_sip_domain && data.inbound_sip_username && data.inbound_sip_password) {
          setInboundSip({
            sip_domain: data.inbound_sip_domain,
            username: data.inbound_sip_username,
            password: data.inbound_sip_password,
          });
        }
        setLoading(false);
      });
  }, [agentId, isNew, navigate]);

  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error(t("agent.field.name"));
      return;
    }
    if (form.handoff_numbers.length > 5) {
      toast.error("max 5");
      return;
    }
    setSaving(true);
    try {
      const res = await saveAgentFn({
        data: {
          id: isNew ? null : agentId,
          data: {
            ...form,
            description: form.description || null,
            twilio_number_e164: form.twilio_number_e164 || null,
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
          <div className="grid md:grid-cols-2 gap-4">
            <Field label={t("agent.field.silence")}>
              <Input type="number" value={form.silence_timeout_seconds} onChange={(e) => set("silence_timeout_seconds", Number(e.target.value))} />
            </Field>
            <Field label={t("agent.field.maxCall")}>
              <Input type="number" value={form.max_call_seconds} onChange={(e) => set("max_call_seconds", Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("agent.field.record")}</Label>
            <Switch checked={form.record_calls} onCheckedChange={(v) => set("record_calls", v)} />
          </div>
        </Section>

        <Section title={t("agent.section.telephony")}>
          <Field label={t("agent.field.twilio")}>
            <Input value={form.twilio_number_e164} onChange={(e) => set("twilio_number_e164", e.target.value)} placeholder="+37360123456" />
          </Field>

          <Field label="Исходящие звонки через">
            <Select value={form.outbound_mode} onValueChange={(v) => set("outbound_mode", v as "twilio_number" | "sip_trunk")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio_number">Twilio номер (по умолчанию)</SelectItem>
                <SelectItem value="sip_trunk">Свой SIP trunk</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {form.outbound_mode === "sip_trunk" && (
            <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">
                Исходящие звонки будут уходить через ваш SIP-провайдер. Если провайдер ждёт номер в формате E.164,
                оставьте Route prefix пустым — тогда номер уйдёт как <code className="font-mono">+373...</code>. Префикс
                нужен только если ваш PBX требует добавлять код маршрута вроде <code className="font-mono">88</code>.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="SIP домен / termination URI" hint="Хост вашего SIP-провайдера для исходящих вызовов, например gpg.vgtele.com">
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
                <Field label="Caller ID (E.164, опционально)">
                  <Input value={form.sip_from_number} onChange={(e) => set("sip_from_number", e.target.value)} placeholder="+37360123456" />
                </Field>
                <Field label="Route prefix (опционально)" hint="Если оставить пустым, номер уходит как +373...; если указать 88, получится 88373...">
                  <Input value={form.sip_route_prefix} onChange={(e) => set("sip_route_prefix", e.target.value)} placeholder="88" />
                </Field>
              </div>
            </div>
          )}
        </Section>

        <Section title="Входящие звонки через SIP">
          <p className="text-xs text-muted-foreground">
            Для входящих вызовов ваш SIP/PBX должен отправлять INVITE прямо на домен агента ниже, а не на Elastic SIP Trunk.
            То есть входящий маршрут должен вести на <code className="font-mono">*.sip.twilio.com</code> из этого блока,
            с указанными логином и паролем — тогда агент автоматически ответит.
          </p>
          {inboundSip ? (
            <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="space-y-3">
                {[
                  { label: "SIP host (Termination URI)", value: inboundSip.sip_domain, hint: "Куда направлять INVITE из вашего PBX" },
                  { label: "Auth username", value: inboundSip.username, hint: "Digest authentication username" },
                  { label: "Auth password", value: inboundSip.password, hint: "Digest authentication password" },
                  { label: "Transport", value: "TLS (рекомендуется), порт 5061", hint: "Поддерживается также UDP/TCP на 5060" },
                  { label: "Формат вызова", value: `sip:+37322010075@${inboundSip.sip_domain}`, hint: "Для вашего номера используйте именно такой адрес в маршруте PBX" },
                ].map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <Label className="text-xs text-muted-foreground">{row.label}</Label>
                      <code className="block font-mono text-xs mt-0.5 break-all">{row.value}</code>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{row.hint}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => copy(row.value, row.label)}>
                      Copy
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleProvisionSip} disabled={provisioning}>
                  {provisioning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Обновить webhook
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={handleDeleteSip} disabled={provisioning}>
                  Удалить SIP-домен
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" onClick={handleProvisionSip} disabled={provisioning || isNew}>
              {provisioning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Создать SIP-домен для входящих
            </Button>
          )}
        </Section>

        <Section title={t("agent.section.handoff")}>
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
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
          <Field label={t("agent.field.numbers")} hint={t("agent.hint.numbers")}>
            <Textarea
              rows={5}
              placeholder="+37360111111&#10;+37360222222"
              value={form.handoff_numbers.join("\n")}
              onChange={(e) => set("handoff_numbers", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
            />
          </Field>
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
