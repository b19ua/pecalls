import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const verifyAdminLogin = createServerFn({ method: "POST" })
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data }) => {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error("ADMIN_PASSWORD is not configured");
    }
    const ok =
      data.username.trim().toLowerCase() === "admin" &&
      data.password === adminPassword;
    if (!ok) {
      // small constant delay to slow brute force
      await new Promise((r) => setTimeout(r, 400));
      throw new Error("Неверный логин или пароль");
    }
    return { ok: true as const };
  });
