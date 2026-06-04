import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pm")({
  beforeLoad: () => {
    throw redirect({ to: "/login", search: { c: "pe" } });
  },
  component: () => null,
});
