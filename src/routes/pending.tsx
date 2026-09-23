import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Clock, Loader2, RefreshCw, LogOut } from "lucide-react";

export const Route = createFileRoute("/pending")({
  head: () => ({
    meta: [
      { title: "Approval pending — Lunara" },
      { name: "description", content: "Your Lunara account was created and is waiting for approval by the platform owner." },
      { property: "og:title", content: "Approval pending — Lunara" },
      { property: "og:description", content: "Your Lunara account is waiting for approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/login", replace: true });
        return;
      }
      setEmail(session.user.email ?? null);
      const { data } = await supabase
        .from("profiles")
        .select("approval_status")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (data?.approval_status === "approved") navigate({ to: "/dashboard", replace: true });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center rounded-2xl border border-border bg-card p-8 shadow-elegant">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Clock className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-bold mt-5">Waiting for approval</h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Your account{email ? ` (${email})` : ""} has been created and is awaiting approval.
          We have notified the platform owner — you will get access as soon as it is approved.
        </p>
        <div className="mt-7 flex flex-col gap-2">
          <Button onClick={check} disabled={checking} className="w-full">
            {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Check again
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/login", replace: true });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
