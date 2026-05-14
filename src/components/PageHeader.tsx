import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  hint?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, hint, actions }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
          {hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">{hint}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {description && (
          <p className="text-muted-foreground mt-1.5 text-sm sm:text-[15px]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
