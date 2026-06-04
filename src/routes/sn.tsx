import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sn")({
  beforeLoad: () => {
    throw redirect({ to: "/login", search: { c: "sn" } });
  },
  component: () => null,
});
