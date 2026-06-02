import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pe")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
