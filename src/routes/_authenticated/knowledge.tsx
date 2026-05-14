import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/knowledge")({ component: KnowledgePage });

function KnowledgePage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="База знаний" description="Загружайте PDF, DOCX, TXT — до 50 МБ на агента. RAG-поиск автоматически." />
      <Card className="bg-gradient-card border-dashed border-2">
        <CardContent className="py-16 text-center">
          <BookOpen className="h-10 w-10 text-primary mx-auto mb-3" />
          <h3 className="font-display text-xl font-semibold mb-2">База знаний скоро</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Загрузка документов и векторный поиск будут добавлены на следующем этапе вместе с Gemini Live мостом.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
