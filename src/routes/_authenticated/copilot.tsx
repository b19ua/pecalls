import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/copilot")({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
