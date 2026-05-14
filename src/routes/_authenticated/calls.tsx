import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { PhoneCall } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calls")({ component: CallsPage });

function CallsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Звонки" description="История всех входящих и исходящих звонков с транскрипцией и записью." />
      <Card className="bg-gradient-card border-dashed border-2">
        <CardContent className="py-16 text-center">
          <PhoneCall className="h-10 w-10 text-primary mx-auto mb-3" />
          <h3 className="font-display text-xl font-semibold mb-2">Пока нет звонков</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            После настройки агента и подключения Twilio-номера сюда будут попадать все звонки —
            с записью аудио, полной транскрипцией и метриками.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
