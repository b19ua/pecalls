import logoFull from "@/assets/logo.png";

type Props = {
  className?: string;
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
};

export function AppLogo({ className = "", size = "md" }: Props) {
  const h = size === "sm" ? "h-8" : size === "lg" ? "h-14" : "h-10";
  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={logoFull}
        alt="Premier Energy AI Calls"
        className={`${h} w-auto object-contain drop-shadow-sm`}
      />
    </div>
  );
}
