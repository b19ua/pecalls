import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Bot, PhoneCall, BookOpen, Megaphone, Settings, LogOut, Phone, Menu, Globe, BarChart3, Radio } from "lucide-react";
import { AppLogo } from "./AppLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useI18n, LANGUAGE_OPTIONS, type Lang } from "@/lib/i18n";
import { ADMIN_SESSION_KEY } from "@/routes/login";

const NAV = [
  { to: "/dashboard",  key: "nav.dashboard",  icon: LayoutDashboard },
  { to: "/agents",     key: "nav.agents",     icon: Bot },
  { to: "/numbers",    key: "nav.numbers",    icon: Phone },
  { to: "/calls",      key: "nav.calls",      icon: PhoneCall },
  { to: "/live",       key: "nav.live",       icon: Radio },
  { to: "/analytics",  key: "nav.analytics",  icon: BarChart3 },
  { to: "/knowledge",  key: "nav.knowledge",  icon: BookOpen },
  { to: "/campaigns",  key: "nav.campaigns",  icon: Megaphone },
  { to: "/settings",   key: "nav.settings",   icon: Settings },
] as const;

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();

  const signOut = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(ADMIN_SESSION_KEY);
    }
    toast.success(t("nav.signOut"));
    navigate({ to: "/login" });
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-4 border-b border-sidebar-border bg-white/5">
        <AppLogo size="md" />
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map(({ to, key, icon: Icon }) => {
          const active = location.pathname === to || location.pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-sidebar-primary/15 text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {t(key)}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Globe className="h-4 w-4 text-sidebar-foreground/60 shrink-0" />
          <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
            <SelectTrigger className="h-9 bg-sidebar-accent/40 border-sidebar-border text-sidebar-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  <span className="mr-1.5">{l.flag}</span>{l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          onClick={signOut}
          className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-[18px] w-[18px]" /> {t("nav.signOut")}
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-sidebar/95 backdrop-blur border-b border-sidebar-border flex items-center justify-between px-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground">
              <Menu className="h-5 w-5" />
              <span className="sr-only">{t("nav.menu")}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
            <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <AppLogo size="sm" />
        <div className="w-10" />
      </div>

      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 lg:pt-0">{children}</main>
    </div>
  );
}
