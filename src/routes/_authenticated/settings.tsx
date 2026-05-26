import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Globe, Mail, Bell } from "lucide-react";
import { useI18n, LANGUAGE_OPTIONS, type Lang } from "@/lib/i18n";
import { getAppSettings, updateAppSettings, listErrorLogs } from "@/lib/admin-settings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const getSettings = useServerFn(getAppSettings);
  const saveSettings = useServerFn(updateAppSettings);
  const getErrors = useServerFn(listErrorLogs);
  const qc = useQueryClient();

  const settingsQ = useQuery({ queryKey: ["app-settings"], queryFn: () => getSettings() });
  const errorsQ = useQuery({ queryKey: ["error-logs"], queryFn: () => getErrors(), refetchInterval: 30_000 });

  const [email, setEmail] = useState("");
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    if (settingsQ.data) {
      setEmail(settingsQ.data.admin_email ?? "");
      setNotify(settingsQ.data.notify_on_errors ?? true);
    }
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: () => saveSettings({ data: { admin_email: email.trim() || null, notify_on_errors: notify } }),
    onSuccess: () => {
      toast.success("Настройки уведомлений сохранены");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось сохранить"),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader title={t("set.title")} description={t("set.subtitle")} />

      <Card className="bg-gradient-card shadow-soft mb-4">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> {t("set.lang")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs text-muted-foreground">{t("set.lang.hint")}</Label>
          <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  <span className="mr-1.5">{l.flag}</span>{l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="bg-gradient-card shadow-soft mb-4">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" /> Уведомления об ошибках
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="admin-email" className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> Email администратора
            </Label>
            <Input
              id="admin-email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 max-w-md"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              На этот адрес будут приходить уведомления о критичных ошибках платформы (Gemini, Twilio, SIP, биллинг). Email-домен подключим позже — пока ошибки также сохраняются в журнал ниже.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3 bg-background/60">
            <div>
              <div className="text-sm font-medium">Отправлять email-уведомления</div>
              <div className="text-xs text-muted-foreground">Когда email-домен подключён — отправлять письма автоматически</div>
            </div>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Сохраняем..." : "Сохранить"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-gradient-card shadow-soft mb-4">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warning" /> Журнал ошибок (последние 50)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {errorsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : !errorsQ.data?.length ? (
            <p className="text-sm text-muted-foreground">Ошибок нет 🎉</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {errorsQ.data.map((e) => (
                <div key={e.id} className="rounded-lg border border-border/50 p-3 bg-background/60 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={e.severity === "critical" ? "destructive" : "secondary"}>{e.severity}</Badge>
                    <span className="text-xs text-muted-foreground">{e.source}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(e.created_at).toLocaleString()}</span>
                    {e.notified && <Badge variant="outline" className="text-xs">отправлено</Badge>}
                  </div>
                  <div className="font-medium break-words">{e.message}</div>
                  {e.call_sid && <div className="text-xs text-muted-foreground mt-1">Call: {e.call_sid}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gradient-card shadow-soft mb-4">
        <CardHeader><CardTitle className="text-base">{t("set.integrations")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Row label="Twilio" status="connected" detail="Lovable Gateway" />
          <Row label="Gemini AI Gateway" status="connected" detail="LOVABLE_API_KEY · gemini-3.1-flash-live-preview" />
          <Row label="WebSocket bridge Twilio ↔ Gemini Live" status="connected" detail="Edge Function deployed" />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, status, detail }: { label: string; status: "connected" | "pending"; detail: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-background/60 border border-border/50">
      {status === "connected" ? (
        <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
      ) : (
        <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
      </div>
    </div>
  );
}
