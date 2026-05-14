import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/campaigns")({ component: CampaignsPage });

function CampaignsPage() {
  const { t } = useI18n();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("camp.title")} description={t("camp.subtitle")} />
      <Card className="bg-gradient-card border-dashed border-2">
        <CardContent className="py-16 text-center">
          <Megaphone className="h-10 w-10 text-primary mx-auto mb-3" />
          <h3 className="font-display text-xl font-semibold mb-2">{t("camp.soon.title")}</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">{t("camp.soon.body")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
