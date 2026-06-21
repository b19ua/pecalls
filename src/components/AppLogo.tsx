import lunaraLogo from "@/assets/lunara-logo.png.asset.json";

type Props = {
  className?: string;
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
};

export function AppLogo({ className = "", size = "md" }: Props) {
  const h = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14" : "h-10 w-10";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={lunaraLogo.url}
        alt="Lunara"
        className={`${h} rounded-full object-contain drop-shadow-sm`}
      />
      <span className="text-lg font-bold tracking-tight text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Lunara
      </span>
    </div>
  );
}
