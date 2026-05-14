import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/AppLogo";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { verifyAdminLogin } from "@/lib/admin-auth.functions";

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
      await login({ data: { username, password } });
      localStorage.setItem(ADMIN_SESSION_KEY, "1");
      toast.success("Добро пожаловать!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-hero text-sidebar-foreground relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, oklch(0.7 0.18 152) 0%, transparent 50%), radial-gradient(circle at 80% 70%, oklch(0.6 0.15 180) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10">
          <AppLogo size="lg" />
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-4xl font-bold leading-tight">
            ИИ-звонки нового поколения
          </h2>
          <p className="mt-4 text-sidebar-foreground/70 text-[15px] leading-relaxed">
            Автоматизированная платформа голосовых ассистентов на базе Gemini Live и Twilio.
            Входящие, исходящие, RAG-знания, human handoff — всё в одном месте.
          </p>
        </div>
        <div className="relative z-10 text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} Premier Energy. Все права защищены.
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <AppLogo size="md" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            <Lock className="h-3.5 w-3.5" /> Админ-панель
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-3">
            Вход в платформу
          </h1>
          <p className="text-muted-foreground mt-2">
            Войдите как администратор, чтобы управлять ИИ-агентами и звонками.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Логин</Label>
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
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
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
              Войти
            </Button>
          </form>

          <p className="mt-6 text-sm text-center">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              ← На главную
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
