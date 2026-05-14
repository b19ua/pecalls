import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

export function HintIcon({ text, className = "" }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={`text-muted-foreground/70 hover:text-foreground transition-colors ${className}`}>
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}
