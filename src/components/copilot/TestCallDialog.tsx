import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneCall, Sparkles } from "lucide-react";
import { startCopilotTestCall } from "@/lib/copilot.functions";
import { toast } from "sonner";

type Agent = { id: string; name: string; enabled: boolean };

export function TestCallDialog({ agents, open, onOpenChange, defaultAgentId }: {
  agents: Agent[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultAgentId?: string;
}) {
  const navigate = useNavigate();
  const start = useServerFn(startCopilotTestCall);
  const enabledAgents = agents.filter((a) => a.enabled);
  const [agentId, setAgentId] = useState(defaultAgentId || enabledAgents[0]?.id || "");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!agentId) return toast.error("Выберите включённого агента");
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      return toast.error("Телефон в формате E.164, например +37360123456");
    }
    setLoading(true);
    try {
      const res = await start({ data: { agentId, phone } });
      toast.success("Звонок запущен — поднимите трубку через 5 секунд");
      onOpenChange(false);
      navigate({ to: "/copilot/sessions/$sessionId", params: { sessionId: res.sessionId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Тестовый звонок AI Copilot
          </DialogTitle>
          <DialogDescription>
            Введите ваш мобильный — через 5 секунд позвонит Lunara. Говорите как клиент: задавайте вопросы, возражайте, торгуйтесь. Транскрипт и AI-подсказки появятся на дашборде моментально.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Copilot-агент</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder="Выберите агента" /></SelectTrigger>
              <SelectContent>
                {enabledAgents.length === 0 ? (
                  <SelectItem value="__none" disabled>Нет включённых агентов</SelectItem>
                ) : enabledAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ваш мобильный (E.164)</Label>
            <Input
              type="tel"
              placeholder="+37360123456"
              value={phone}
              onChange={(e) => setPhone(e.target.value.trim())}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Включите «+» и код страны. Никуда не передаётся — только Twilio инициирует звонок.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Отмена</Button>
          <Button onClick={onSubmit} disabled={loading || !agentId || !phone}>
            <PhoneCall className="h-4 w-4 mr-1.5" />
            {loading ? "Запуск…" : "Позвонить мне"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
