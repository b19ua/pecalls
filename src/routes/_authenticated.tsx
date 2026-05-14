import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ADMIN_SESSION_KEY } from "./login";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = localStorage.getItem(ADMIN_SESSION_KEY) === "1";
    if (!ok) {
      navigate({ to: "/login", replace: true });
    } else {
      setReady(true);
    }
  }, [navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Загрузка…
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
