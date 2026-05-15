import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const Schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

const ADMIN_EMAIL = "admin@premier.local";

export const verifyAdminLogin = createServerFn({ method: "POST" })
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data }) => {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!adminPassword) throw new Error("ADMIN_PASSWORD is not configured");
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Supabase is not configured");
    }
    const ok =
      data.username.trim().toLowerCase() === "admin" &&
      data.password === adminPassword;
    if (!ok) {
      await new Promise((r) => setTimeout(r, 400));
      throw new Error("Invalid login or password");
    }

    // Ensure admin user exists in Supabase auth, then sign in to get a session.
    const anonClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });

    let signIn = await anonClient.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: adminPassword,
    });

    if (signIn.error) {
      // Try to create the user (idempotent), then sign in again.
      const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: adminPassword,
        email_confirm: true,
      });
      if (createErr && !/already|registered|exists/i.test(createErr.message)) {
        throw new Error(createErr.message);
      }
      // If the user already existed but with a different password, reset it.
      if (createErr) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers();
        const existing = list?.users.find((u) => u.email === ADMIN_EMAIL);
        if (existing) {
          await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password: adminPassword,
            email_confirm: true,
          });
        }
      }
      signIn = await anonClient.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: adminPassword,
      });
      if (signIn.error || !signIn.data.session) {
        throw new Error(signIn.error?.message || "Failed to establish session");
      }
    }

    const session = signIn.data.session!;
    return {
      ok: true as const,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  });
