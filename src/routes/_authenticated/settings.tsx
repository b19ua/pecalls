import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeader title="Настройки" description="Подключения, ключи и параметры платформы." />

      <Card className="bg-gradient-card shadow-soft mb-4">
        <CardHeader><CardTitle className="text-base">Интеграции</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Row label="Twilio коннектор" status="connected" detail="Звонки и SMS работают через Lovable Gateway." />
          <Row label="Gemini AI (Lovable AI Gateway)" status="connected" detail="LOVABLE_API_KEY настроен. Модель: gemini-2.5-flash native audio." />
          <Row label="WebSocket мост Twilio ↔ Gemini Live" status="pending" detail="Будет реализован на следующем этапе (отдельный сервер)." />
        </CardContent>
      </Card>

      <Card className="bg-gradient-card shadow-soft">
        <CardHeader><CardTitle className="text-base">Что дальше</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Конструктор агентов с предпрослушкой голосов</p>
          <p>• Загрузка RAG-документов и индексация эмбеддингов</p>
          <p>• TwiML вебхуки для входящих и исходящих</p>
          <p>• Media Streams ↔ Gemini Live мост</p>
          <p>• Логика human handoff (фраза + DTMF, рандомный свободный номер)</p>
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
