import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLogo } from "@/components/AppLogo";
import starnetAsset from "@/assets/starnet-logo.png.asset.json";
import { useI18n } from "@/lib/i18n";

type Profile = { display_name: string | null; email: string | null };

export function UserBanner() {
  const { t, lang } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name,email")
        .eq("id", user.id)
        .maybeSingle();
      setProfile({
        display_name: data?.display_name ?? user.user_metadata?.display_name ?? null,
        email: data?.email ?? user.email ?? null,
      });
    })();
  }, []);

  if (!profile) return null;

  const name = (profile.display_name || profile.email?.split("@")[0] || "").trim();
  const lower = name.toLowerCase();

  if (lower === "premier" || lower.startsWith("premier")) {
    return (
      <div className="mb-6 rounded-2xl border border-border/60 bg-white/95 px-6 py-5 shadow-soft flex items-center justify-center">
        <AppLogo size="lg" />
      </div>
    );
  }

  if (lower === "starnet") {
    return (
      <div className="mb-6 rounded-2xl border border-border/60 bg-white/95 px-6 py-5 shadow-soft flex items-center justify-center">
        <img src={starnetAsset.url} alt="StarNet" className="h-14 w-auto object-contain" />
      </div>
    );
  }

  const hello = lang === "ru" ? "Добро пожаловать" : lang === "ro" ? "Bun venit" : "Welcome";
  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary-glow/10 to-transparent px-6 py-5">
      <div className="font-display text-2xl font-bold tracking-tight">
        {hello}, {name}!
      </div>
    </div>
  );
}
