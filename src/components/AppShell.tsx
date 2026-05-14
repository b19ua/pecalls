import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Bot, PhoneCall, BookOpen, Megaphone, Settings, LogOut, Phone } from "lucide-react";
import { AppLogo } from "./AppLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const NAV = [
  { to: "/dashboard",  label: "Дашборд",        icon: LayoutDashboard },
  { to: "/agents",     label: "ИИ-агенты",      icon: Bot },
  { to: "/numbers",    label: "Номера Twilio",  icon: Phone },
  { to: "/calls",      label: "Звонки",         icon: PhoneCall },
  { to: "/knowledge",  label: "База знаний",    icon: BookOpen },
  { to: "/campaigns",  label: "Кампании",       icon: Megaphone },
  { to: "/settings",   label: "Настройки",      icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Вы вышли из системы");
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border">
          <AppLogo variant="light" />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" /> Выйти
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
    </div>
  );
}
