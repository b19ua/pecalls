import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setAuthed(!!s);
      setChecked(true);
      if (!s) navigate({ to: "/login" });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
      setChecked(true);
      if (!session) navigate({ to: "/login" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!authed) return null;
  return <AppShell><Outlet /></AppShell>;
}
