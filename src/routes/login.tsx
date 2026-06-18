import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/AppLogo";
import lunaraVoxAsset from "@/assets/lunara-vox.png.asset.json";
import starnetAsset from "@/assets/starnet-logo.png.asset.json";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { verifyAdminLogin } from "@/lib/admin-auth.functions";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_SESSION_KEY = "pe_admin_session";

const searchSchema = z.object({
  c: z.enum(["pe", "sn"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: (s) => searchSchema.parse(s),
  component: LoginPage,
});

type ClientId = "pe" | "sn";

const CLIENTS: Record<ClientId, {
  name: string;
  logo: string;
  logoClass: string;
  tagline: string;
  description: string;
}> = {
  pe: {
    name: "Premier Energy",
    logo: lunaraVoxAsset.url,
    logoClass: "w-2/3",
    tagline: "Next-generation AI calling",
    description:
      "Automated voice assistant platform powered by Gemini Live and Twilio. Inbound, outbound, RAG knowledge, human handoff — all in one place.",
  },
  sn: {
    name: "StarNet",
    logo: starnetAsset.url,
    logoClass: "w-1/2",
    tagline: "AI voice support for every subscriber",
    description:
      "StarNet's AI calling workspace on Lunara. Handle inbound support, run outbound campaigns and connect agents to your internal systems.",
  },
};

function LoginPage() {
  const navigate = useNavigate();
  const { c } = Route.useSearch();
  const client = CLIENTS[(c ?? "pe") as ClientId];
  const login = useServerFn(verifyAdminLogin);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const res = await login({ data: { username, password } });
        const { error: setErr } = await supabase.auth.setSession({
          access_token: res.access_token,
          refresh_token: res.refresh_token,
        });
        if (setErr) throw setErr;
        localStorage.setItem(ADMIN_SESSION_KEY, "1");
        toast.success("Welcome back!");
        navigate({ to: "/dashboard" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (data.session) {
          localStorage.setItem(ADMIN_SESSION_KEY, "1");
          toast.success("Account created!");
          navigate({ to: "/dashboard" });
        } else {
          toast.success("Check your email to confirm your account.");
          setMode("signin");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/dashboard" },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col p-10 bg-sidebar text-sidebar-foreground relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, oklch(0.75 0.2 152) 0%, transparent 50%), radial-gradient(circle at 80% 70%, oklch(0.65 0.18 220) 0%, transparent 55%)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-transparent to-black/60 pointer-events-none" />
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
          <div className="bg-white/95 rounded-2xl p-8 shadow-2xl w-2/3 flex items-center justify-center">
            <img
              src={client.logo}
              alt={client.name}
              className={`${client.logoClass} h-auto object-contain`}
            />
          </div>
          <div className="max-w-md mx-auto text-center mt-8">
            <h2 className="font-display text-4xl font-bold leading-tight text-white drop-shadow">
              {client.tagline}
            </h2>
            <p className="mt-4 text-white/90 text-[15px] leading-relaxed">
              {client.description}
            </p>
          </div>
        </div>
        <div className="relative z-10 text-xs text-white/70 mt-8 text-center">
          © {new Date().getFullYear()} {client.name}. All rights reserved.
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center justify-center">
            {c === "sn" ? (
              <img src={starnetAsset.url} alt="StarNet" className="h-12 w-auto" />
            ) : (
              <AppLogo size="md" />
            )}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            <Lock className="h-3.5 w-3.5" /> {client.name} workspace
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-3">
            {mode === "signin" ? "Sign in to the platform" : "Create your workspace"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {mode === "signin"
              ? "Sign in with your username or email."
              : "Register to get your own dashboard."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {mode === "signin" ? (
              <div className="space-y-1.5">
                <Label htmlFor="username">Username or email</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder=""
                  autoComplete="username"
                  required
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="displayName">Display name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signin" ? "Enter your password" : "At least 8 characters"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={mode === "signup" ? 8 : undefined}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-primary shadow-elegant"
              size="lg"
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px bg-border flex-1" /> OR <div className="h-px bg-border flex-1" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            onClick={onGoogle}
            disabled={loading}
          >
            Continue with Google
          </Button>

          <p className="mt-6 text-sm text-center">
            {mode === "signin" ? (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setMode("signup")}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-center">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

