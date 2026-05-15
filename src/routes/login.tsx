import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/AppLogo";
import logoFull from "@/assets/logo.png";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { verifyAdminLogin } from "@/lib/admin-auth.functions";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_SESSION_KEY = "pe_admin_session";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const login = useServerFn(verifyAdminLogin);
  const [username, setUsername] = useState("Admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login({ data: { username, password } });
      const { error: setErr } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (setErr) throw setErr;
      localStorage.setItem(ADMIN_SESSION_KEY, "1");
      toast.success("Welcome back!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col p-10 bg-gradient-hero text-sidebar-foreground relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, oklch(0.7 0.18 152) 0%, transparent 50%), radial-gradient(circle at 80% 70%, oklch(0.6 0.15 180) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <img
            src={logoFull}
            alt="Premier Energy AI Calls"
            className="w-1/3 h-auto object-contain drop-shadow-lg"
          />
        </div>
        <div className="relative z-10 max-w-md mx-auto text-center">
          <h2 className="font-display text-4xl font-bold leading-tight">
            Next-generation AI calling
          </h2>
          <p className="mt-4 text-sidebar-foreground/70 text-[15px] leading-relaxed">
            Automated voice assistant platform powered by Gemini Live and Twilio.
            Inbound, outbound, RAG knowledge, human handoff — all in one place.
          </p>
        </div>
        <div className="relative z-10 text-xs text-sidebar-foreground/50 mt-8 text-center">
          © {new Date().getFullYear()} Premier Energy. All rights reserved.
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <AppLogo size="md" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            <Lock className="h-3.5 w-3.5" /> Admin panel
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-3">
            Sign in to the platform
          </h1>
          <p className="text-muted-foreground mt-2">
            Sign in as administrator to manage AI agents and calls.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Admin"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-primary shadow-elegant"
              size="lg"
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-sm text-center">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
