import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { GEMINI_VOICES, LANGUAGES } from "@/lib/voices";
import { PageHeader } from "@/components/PageHeader";
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
};

const DEFAULTS: AgentForm = {
  name: "",
  description: "",
  greeting: "Здравствуйте! Чем могу помочь?",
  system_prompt: "Ты вежливый ассистент Premier Energy. Отвечай кратко и по делу.",
  voice: "Puck",
  language: "ru-RU",
  model: "gemini-2.5-flash-preview-native-audio-dialog",
  temperature: 0.8,
  twilio_number_e164: "",
  is_active: true,
  record_calls: true,
  silence_timeout_seconds: 8,
  max_call_seconds: 600,
  handoff_enabled: true,
  handoff_dtmf_digit: "0",
  handoff_trigger_phrases: ["соедини с менеджером", "оператор", "human", "manager"],
  handoff_numbers: [],
};

function AgentEditor() {
  const { agentId } = useParams({ from: "/_authenticated/agents/$agentId" });
  const isNew = agentId === "new";
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<AgentForm>(DEFAULTS);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    if (isNew) return;
    supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error("Агент не найден");
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
        });
        setLoading(false);
      });
  }, [agentId, isNew, navigate]);

  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!user) return;
    if (!form.name.trim()) {
      toast.error("Укажите имя агента");
      return;
    }
    if (form.handoff_numbers.length > 5) {
      toast.error("Не более 5 номеров для handoff");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      twilio_number_e164: form.twilio_number_e164 || null,
      description: form.description || null,
      owner_id: user.id,
    };
    const { data, error } = isNew
      ? await supabase.from("agents").insert(payload).select("id").single()
      : await supabase.from("agents").update(payload).eq("id", agentId).select("id").single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isNew ? "Агент создан" : "Сохранено");
    if (isNew && data) navigate({ to: "/agents/$agentId", params: { agentId: data.id } });
  }

  async function handleDelete() {
    if (!confirm("Удалить агента и всю его базу знаний?")) return;
    const { error } = await supabase.from("agents").delete().eq("id", agentId);
    if (error) return toast.error(error.message);
    toast.success("Удалено");
    navigate({ to: "/agents" });
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/agents"><ArrowLeft className="h-4 w-4 mr-1" /> К агентам</Link>
      </Button>
      <PageHeader
        title={isNew ? "Новый агент" : form.name || "Агент"}
        description="Голос, поведение, handoff и Twilio-номер"
        actions={
          <div className="flex gap-2">
            {!isNew && (
              <Button variant="outline" onClick={() => setTestOpen(true)}>
                <PhoneCall className="h-4 w-4 mr-1.5" /> Test Call
              </Button>
            )}
            {!isNew && (
              <Button variant="outline" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Удалить
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving} className="bg-gradient-primary shadow-elegant">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Сохранить
            </Button>
          </div>
        }
      />

      <div className="space-y-5">
        <Section title="Основное">
          <Field label="Имя агента">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Премьер Поддержка" />
          </Field>
          <Field label="Описание">
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </Field>
          <div className="flex items-center justify-between">
            <Label>Активен</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
          </div>
        </Section>

        <Section title="Голос и язык">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Голос Gemini">
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
            <Field label="Язык">
              <Select value={form.language} onValueChange={(v) => set("language", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={`Температура: ${form.temperature.toFixed(2)}`}>
            <Slider value={[form.temperature]} min={0} max={1.5} step={0.05} onValueChange={(v) => set("temperature", v[0])} />
          </Field>
        </Section>

        <Section title="Поведение">
          <Field label="Приветствие (произносится при ответе)">
            <Textarea value={form.greeting} onChange={(e) => set("greeting", e.target.value)} rows={2} />
          </Field>
          <Field label="Системный промпт">
            <Textarea value={form.system_prompt} onChange={(e) => set("system_prompt", e.target.value)} rows={6} />
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Тишина перед завершением (сек)">
              <Input type="number" value={form.silence_timeout_seconds} onChange={(e) => set("silence_timeout_seconds", Number(e.target.value))} />
            </Field>
            <Field label="Макс. длительность звонка (сек)">
              <Input type="number" value={form.max_call_seconds} onChange={(e) => set("max_call_seconds", Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex items-center justify-between">
            <Label>Записывать звонки</Label>
            <Switch checked={form.record_calls} onCheckedChange={(v) => set("record_calls", v)} />
          </div>
        </Section>

        <Section title="Telephony">
          <Field label="Twilio номер (E.164, для входящих)">
            <Input value={form.twilio_number_e164} onChange={(e) => set("twilio_number_e164", e.target.value)} placeholder="+37360123456" />
          </Field>
        </Section>

        <Section title="Human Handoff">
          <div className="flex items-center justify-between">
            <Label>Включить handoff</Label>
            <Switch checked={form.handoff_enabled} onCheckedChange={(v) => set("handoff_enabled", v)} />
          </div>
          <Field label="DTMF цифра (нажатие на телефоне)">
            <Input maxLength={1} value={form.handoff_dtmf_digit} onChange={(e) => set("handoff_dtmf_digit", e.target.value)} className="w-24" />
          </Field>
          <Field label="Триггерные фразы (через запятую)">
            <Textarea
              rows={2}
              value={form.handoff_trigger_phrases.join(", ")}
              onChange={(e) => set("handoff_trigger_phrases", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            />
          </Field>
          <Field label="Номера для перевода (до 5, по одному в строке)">
            <Textarea
              rows={5}
              placeholder="+37360111111&#10;+37360222222"
              value={form.handoff_numbers.join("\n")}
              onChange={(e) => set("handoff_numbers", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
            />
            <p className="text-xs text-muted-foreground mt-1">Звонок переводится на случайный свободный номер из списка.</p>
          </Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-gradient-card shadow-soft">
      <CardContent className="p-6 space-y-4">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <Separator />
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
