import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2, ArrowLeft, Copy, ExternalLink, Phone, Plug, AlertCircle, PhoneCall } from "lucide-react";
import { getCopilotAgent, saveCopilotAgent, deleteCopilotAgent } from "@/lib/copilot.functions";
import { TestCallDialog } from "@/components/copilot/TestCallDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/copilot/agents/$agentId")({ component: Page });

const ALL_CATEGORIES = ["objection", "upsell", "compliance", "emotion", "next_step", "discovery", "closing", "tone"];

const DEFAULT_PROMPT = `Ты — AI Copilot, который незаметно слушает разговор менеджера по продажам с клиентом.
Твоя задача: вовремя подсказывать менеджеру короткие, конкретные действия — БЕЗ воды.

Правила:
- Отслеживай возражения, эмоции клиента (frustration / curiosity / hesitation / interest), скрытые потребности.
- Используй фреймворк AAA: Acknowledge → Ask → Answer.
- Если клиент молчит >5 сек после ключевого вопроса — предложи менеджеру переформулировать.
- Не повторяй одну и ту же подсказку дважды.
- Каждая подсказка — максимум 1–2 коротких предложения, императив ("Спроси про бюджет", "Подтверди срок").
- Категория обязательна: objection | upsell | compliance | emotion | next_step | discovery | closing | tone.
- Приоритет: high (риск потерять сделку), normal, low.
`;

type Agent = {
  id?: string;
  name: string;
  description: string;
  system_prompt: string;
  language: "ru" | "ro" | "en";
  enabled: boolean;
  suggestion_categories: string[];
  knowledge_hint: string;
  product_context: string;
  competitor_context: string;
  pricing_context: string;
  channel_binding: string;
  emotion_tracking_enabled: boolean;
  objection_handling_enabled: boolean;
  min_suggestion_interval_ms: number;
};

const EMPTY: Agent = {
  name: "",
  description: "",
  system_prompt: DEFAULT_PROMPT,
  language: "ru",
  enabled: true,
  suggestion_categories: ["objection", "upsell", "emotion", "next_step"],
  knowledge_hint: "",
  product_context: "",
  competitor_context: "",
  pricing_context: "",
  channel_binding: "",
  emotion_tracking_enabled: true,
  objection_handling_enabled: true,
  min_suggestion_interval_ms: 4000,
};

function Page() {
  const { agentId } = useParams({ from: "/_authenticated/copilot/agents/$agentId" });
  const navigate = useNavigate();
  const isNew = agentId === "new";
  const get = useServerFn(getCopilotAgent);
  const save = useServerFn(saveCopilotAgent);
  const del = useServerFn(deleteCopilotAgent);
  const [agent, setAgent] = useState<Agent>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    if (isNew) return;
    get({ data: { id: agentId } })
      .then((r) => { setAgent({ ...EMPTY, ...(r.agent as Agent) }); setLoading(false); })
      .catch((e) => { toast.error((e as Error).message); setLoading(false); });
  }, [agentId]);

  const update = <K extends keyof Agent>(k: K, v: Agent[K]) => setAgent((a) => ({ ...a, [k]: v }));

  const toggleCategory = (c: string) => {
    setAgent((a) => ({
      ...a,
      suggestion_categories: a.suggestion_categories.includes(c)
        ? a.suggestion_categories.filter((x) => x !== c)
        : [...a.suggestion_categories, c],
    }));
  };

  const onSave = async () => {
    if (!agent.name.trim()) { toast.error("Укажите имя"); return; }
    setSaving(true);
    try {
      const { id } = await save({ data: { id: isNew ? null : agentId, data: agent } });
      toast.success("Сохранено");
      if (isNew) navigate({ to: "/copilot/agents/$agentId", params: { agentId: id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  };

  const onDelete = async () => {
    if (isNew) return;
    if (!confirm("Удалить copilot-агента?")) return;
    try {
      await del({ data: { id: agentId } });
      toast.success("Удалено");
      navigate({ to: "/copilot/agents" });
    } catch (e) { toast.error((e as Error).message); }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Загрузка…</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate({ to: "/copilot/agents" })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Назад
      </Button>
      <PageHeader
        title={isNew ? "Новый copilot-агент" : agent.name || "Copilot-агент"}
        description="Конфигурация ИИ-наблюдателя для звонков менеджеров. Поведение можно менять без перезапуска."
        actions={
          <div className="flex flex-wrap gap-2">
            {!isNew && agent.enabled && (
              <Button variant="default" className="bg-gradient-to-r from-primary to-primary/70" onClick={() => setTestOpen(true)}>
                <PhoneCall className="h-4 w-4 mr-1" /> Тестовый звонок
              </Button>
            )}
            {!isNew && <Button variant="outline" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" />Удалить</Button>}
            <Button onClick={onSave} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Сохранение…" : "Сохранить"}</Button>
          </div>
        }
      />
      {!isNew && (
        <TestCallDialog
          agents={[{ id: agentId, name: agent.name || "Copilot", enabled: !!agent.enabled }]}
          defaultAgentId={agentId}
          open={testOpen}
          onOpenChange={setTestOpen}
        />
      )}

      <div className="grid gap-4">
        <Card><CardContent className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Имя</Label>
              <Input value={agent.name} onChange={(e) => update("name", e.target.value)} placeholder="Например: Sales Copilot RU" />
            </div>
            <div>
              <Label>Язык анализа</Label>
              <Select value={agent.language} onValueChange={(v) => update("language", v as Agent["language"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="ro">Română</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Описание</Label>
            <Input value={agent.description} onChange={(e) => update("description", e.target.value)} placeholder="Для какой команды / продукта" />
          </div>
          <div className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <div className="font-medium text-sm">Включён</div>
              <div className="text-xs text-muted-foreground">Анализирует новые сессии</div>
            </div>
            <Switch checked={agent.enabled} onCheckedChange={(v) => update("enabled", v)} />
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-5 space-y-4">
          <div>
            <Label>Системный промпт</Label>
            <Textarea rows={10} value={agent.system_prompt} onChange={(e) => update("system_prompt", e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Правила поведения copilot-а. Применяются мгновенно при следующем звонке.</p>
          </div>
          <div>
            <Label>Категории подсказок</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_CATEGORIES.map((c) => {
                const active = agent.suggestion_categories.includes(c);
                return (
                  <button key={c} type="button" onClick={() => toggleCategory(c)}>
                    <Badge variant={active ? "default" : "outline"} className="cursor-pointer">{c}</Badge>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <div className="font-medium text-sm">Анализ эмоций</div>
                <div className="text-xs text-muted-foreground">Frustration / interest / hesitation</div>
              </div>
              <Switch checked={agent.emotion_tracking_enabled} onCheckedChange={(v) => update("emotion_tracking_enabled", v)} />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <div className="font-medium text-sm">Работа с возражениями</div>
                <div className="text-xs text-muted-foreground">Фреймворк AAA</div>
              </div>
              <Switch checked={agent.objection_handling_enabled} onCheckedChange={(v) => update("objection_handling_enabled", v)} />
            </div>
          </div>
          <div>
            <Label>Мин. интервал между подсказками (мс)</Label>
            <Input
              type="number"
              min={1000}
              max={30000}
              step={500}
              value={agent.min_suggestion_interval_ms}
              onChange={(e) => update("min_suggestion_interval_ms", Number(e.target.value) || 4000)}
            />
            <p className="text-xs text-muted-foreground mt-1">Чтобы не заваливать менеджера. 4000 мс — рекомендуется.</p>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-5 space-y-4">
          <div className="font-semibold text-sm">Контекст знаний</div>
          <div>
            <Label>Продукт</Label>
            <Textarea rows={3} value={agent.product_context} onChange={(e) => update("product_context", e.target.value)} placeholder="Что продаём, ключевые фичи, USP" />
          </div>
          <div>
            <Label>Конкуренты</Label>
            <Textarea rows={3} value={agent.competitor_context} onChange={(e) => update("competitor_context", e.target.value)} placeholder="Чем отличаемся, типовые сравнения" />
          </div>
          <div>
            <Label>Цены / тарифы</Label>
            <Textarea rows={3} value={agent.pricing_context} onChange={(e) => update("pricing_context", e.target.value)} placeholder="Сколько стоит, скидки, условия" />
          </div>
          <div>
            <Label>Доп. подсказки знаний</Label>
            <Textarea rows={3} value={agent.knowledge_hint} onChange={(e) => update("knowledge_hint", e.target.value)} placeholder="Любые факты, на которые ссылаться" />
          </div>
        </CardContent></Card>

        <ConnectPanel agentId={isNew ? null : agentId} />

        <Card><CardContent className="p-5 space-y-4">
          <div className="font-semibold text-sm">Привязка канала (на будущее)</div>
          <div>
            <Label>Channel binding (необязательно)</Label>
            <Input
              value={agent.channel_binding}
              onChange={(e) => update("channel_binding", e.target.value)}
              placeholder="Напр. имя очереди, SIP trunk или Twilio sub-account"
            />
            <p className="text-xs text-muted-foreground mt-1">
              MVP работает на Twilio Media Streams (см. блок «Как подключить» выше). Это поле зарезервировано для Phase&nbsp;2 — подключения Asterisk/3CX/FreePBX через AudioSocket.
            </p>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Скопировано"),
    () => toast.error("Не удалось скопировать"),
  );
}

function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2 mt-1">
        <Input value={value} readOnly className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" size="icon" onClick={() => copy(value)} title="Копировать">
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function ConnectPanel({ agentId }: { agentId: string | null }) {
  if (!agentId) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            Сохраните агента — после этого появится блок «Как подключить» с готовыми ссылками для Twilio и инструкцией шаг за шагом.
          </div>
        </CardContent>
      </Card>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const isPreview = origin.includes("lovable.app") && origin.includes("preview");
  const baseHttps = origin || "https://<ваш-домен>";
  // Twilio Voice webhook (TwiML): listens silently + dials manager
  const twimlUrl = `${baseHttps}/api/public/twilio/copilot-stream?agent_id=${agentId}&dial=<E164_номер_менеджера>&manager=<имя>`;
  const wssBase = baseHttps.replace(/^https?:/, "wss:");
  const directWss = `${wssBase}/api/public/voice-ws/copilot?agent_id=${agentId}`; // reserved for AudioSocket / Asterisk

  return (
    <Card className="border-primary/40">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          <div className="font-semibold">Как подключить copilot к звонкам</div>
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
          <div className="font-medium">Вариант A — Twilio (рекомендуется для MVP)</div>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
            <li>В Twilio Console → <b>Phone Numbers</b> выберите номер, на который будут приходить клиенты.</li>
            <li>В разделе <b>A call comes in</b> выберите <b>Webhook</b>, метод <b>HTTP POST</b>.</li>
            <li>Вставьте URL ниже, заменив <code>&lt;E164_номер_менеджера&gt;</code> на реальный номер (например <code>+37360123456</code>).</li>
            <li>Сохраните. Звонок пойдёт менеджеру как обычно, а copilot будет слушать оба трека и подсказывать в дашборде.</li>
          </ol>
        </div>

        <CopyRow
          label="Twilio Voice webhook URL"
          value={twimlUrl}
          hint="Параметры: agent_id (этот copilot), dial (E.164 номер менеджера), manager (имя для дашборда)."
        />

        <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
          <div className="font-medium flex items-center gap-1.5"><Phone className="h-4 w-4" /> Вариант B — исходящий звонок менеджера через Twilio</div>
          <p className="text-xs text-muted-foreground">
            Если менеджер сам инициирует звонок через ваш softphone/CRM, направьте исходящий маршрут на Twilio SIP-домен и используйте этот же webhook как <b>A call comes in</b> на Twilio TwiML App. <code>dial</code> подставится из поля To автоматически.
          </p>
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
          <div className="font-medium">Вариант C — Asterisk / 3CX / FreePBX (Phase 2)</div>
          <p className="text-xs text-muted-foreground">
            Пока что для не-Twilio PBX рекомендуем направить trunk на Twilio (вариант A). В следующей фазе мы добавим прямой приёмник AudioSocket по адресу ниже — поле зарезервировано:
          </p>
        </div>

        <CopyRow
          label="WebSocket для AudioSocket (зарезервировано)"
          value={directWss}
          hint="Phase 2. Пока не работает — используйте Twilio TwiML выше."
        />

        {isPreview && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs flex gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              Сейчас открыт <b>preview-домен</b>. Twilio должен видеть стабильный URL — после публикации проекта замените домен в URL на <code>https://&lt;ваш-проект&gt;.lovable.app</code> или ваш custom domain.
              <a className="underline ml-1 inline-flex items-center gap-0.5" href="https://www.twilio.com/console/phone-numbers/incoming" target="_blank" rel="noreferrer">Twilio Console <ExternalLink className="h-3 w-3" /></a>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t pt-3">
          <b>Что произойдёт после подключения:</b> при входящем звонке Twilio отправит TwiML-запрос на этот URL → мы создадим запись в <b>copilot_sessions</b> → запустим параллельный <code>&lt;Stream&gt;</code> на <code>copilot-bridge</code> → в карточке сессии в реальном времени появятся транскрипт и подсказки (Realtime через Supabase). Менеджер при этом просто разговаривает обычно.
        </div>
      </CardContent>
    </Card>
  );
}
