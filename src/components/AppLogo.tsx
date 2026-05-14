import logoMark from "@/assets/logo-mark.png";

type Props = {
  className?: string;
  showText?: boolean;
  variant?: "light" | "dark";
};

export function AppLogo({ className = "", showText = true, variant = "dark" }: Props) {
  const textColor = variant === "light" ? "text-sidebar-foreground" : "text-foreground";
  const subColor = variant === "light" ? "text-sidebar-foreground/60" : "text-muted-foreground";
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={logoMark}
        alt="Premier Energy AI Calls"
        width={36}
        height={36}
        className="h-9 w-9 object-contain drop-shadow-sm"
      />
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className={`font-display font-bold text-[15px] tracking-tight ${textColor}`}>
            Premier Energy
          </span>
          <span className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${subColor}`}>
            AI Calls
          </span>
        </div>
      )}
    </div>
  );
}
