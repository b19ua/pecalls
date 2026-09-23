import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const gate = async (session: { user: { id: string } } | null) => {
      if (!active) return;
      if (!session) {
        setReady(false);
        navigate({ to: "/login", replace: true });
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("approval_status")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!active) return;
      if (data && data.approval_status !== "approved") {
        setReady(false);
        navigate({ to: "/pending", replace: true });
        return;
      }
      setReady(true);
    };

    supabase.auth.getSession().then(({ data: { session } }) => gate(session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      gate(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
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
