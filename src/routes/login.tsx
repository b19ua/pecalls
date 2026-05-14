import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/AppLogo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { display_name: name || email.split("@")[0] },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;
        toast.success("Аккаунт создан. Проверьте email для подтверждения.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Добро пожаловать!");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-hero text-sidebar-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: "radial-gradient(circle at 20% 30%, oklch(0.7 0.18 152) 0%, transparent 50%), radial-gradient(circle at 80% 70%, oklch(0.6 0.15 180) 0%, transparent 50%)",
        }} />
        <div className="relative z-10">
          <AppLogo variant="light" />
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-4xl font-bold leading-tight">
            ИИ-звонки нового поколения
          </h2>
          <p className="mt-4 text-sidebar-foreground/70 text-[15px] leading-relaxed">
            Автоматизированная платформа голосовых ассистентов на базе Gemini Live и Twilio.
            Входящие, исходящие, RAG-знания, human handoff — всё в одном месте.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { v: "30+", l: "голосов Gemini" },
              { v: "24/7", l: "автоответ" },
              { v: "5", l: "номеров handoff" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-sidebar-accent/40 backdrop-blur-sm p-4 border border-sidebar-border">
                <div className="font-display text-2xl font-bold text-sidebar-primary">{s.v}</div>
                <div className="text-xs text-sidebar-foreground/60 mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} Premier Energy. Все права защищены.
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8"><AppLogo /></div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {mode === "signin" ? "Вход в платформу" : "Создать аккаунт"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {mode === "signin" ? "Войдите, чтобы управлять ИИ-агентами и звонками." : "Зарегистрируйтесь — первый аккаунт станет администратором."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Имя</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@premierenergy.md" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 6 символов" />
            </div>
            <Button type="submit" className="w-full bg-gradient-primary shadow-elegant" size="lg" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "signin" ? "Войти" : "Создать аккаунт"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-muted-foreground">
            {mode === "signin" ? "Нет аккаунта? " : "Уже есть аккаунт? "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-primary font-medium hover:underline"
            >
              {mode === "signin" ? "Зарегистрироваться" : "Войти"}
            </button>
          </p>
          <p className="mt-2 text-sm text-center">
            <Link to="/" className="text-muted-foreground hover:text-foreground">← На главную</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
