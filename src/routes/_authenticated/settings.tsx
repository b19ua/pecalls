import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, Globe } from "lucide-react";
import { useI18n, LANGUAGE_OPTIONS, type Lang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
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
        <CardHeader><CardTitle className="text-base">{t("set.integrations")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Row label="Twilio" status="connected" detail="Lovable Gateway" />
          <Row label="Gemini AI Gateway" status="connected" detail="LOVABLE_API_KEY · gemini-3.1-flash-live-preview" />
          <Row label="WebSocket bridge Twilio ↔ Gemini Live" status="connected" detail="Edge Function deployed" />
        </CardContent>
      </Card>

      <Card className="bg-gradient-card shadow-soft">
        <CardHeader><CardTitle className="text-base">{t("set.next")}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• {t("set.next.1")}</p>
          <p>• {t("set.next.2")}</p>
          <p>• {t("set.next.3")}</p>
          <p>• {t("set.next.4")}</p>
          <p>• {t("set.next.5")}</p>
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
