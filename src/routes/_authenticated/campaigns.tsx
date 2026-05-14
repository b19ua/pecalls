import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns")({ component: CampaignsPage });

function CampaignsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Кампании" description="Массовые исходящие звонки: импорт CSV, расписание, лимиты одновременных линий." />
      <Card className="bg-gradient-card border-dashed border-2">
        <CardContent className="py-16 text-center">
          <Megaphone className="h-10 w-10 text-primary mx-auto mb-3" />
          <h3 className="font-display text-xl font-semibold mb-2">Кампании скоро</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Будут добавлены на следующем этапе.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
