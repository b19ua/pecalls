import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listApprovalUsersFn, setApprovalFn } from "@/lib/approvals.functions";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { Check, Loader2, Undo2, X, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{String((error as Error).message ?? "Error")}</div>
  ),
  notFoundComponent: () => <div className="p-6">Не найдено</div>,
});

const BADGE: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-600",
  pending: "bg-amber-500/10 text-amber-600",
  rejected: "bg-destructive/10 text-destructive",
};

function AdminUsersPage() {
  const listFn = useServerFn(listApprovalUsersFn);
  const setFn = useServerFn(setApprovalFn);

  const q = useQuery({ queryKey: ["admin-approvals"], queryFn: () => listFn() });

  const mutate = useMutation({
    mutationFn: (v: { user_id: string; status: "approved" | "pending" | "rejected" }) =>
      setFn({ data: v }),
    onSuccess: () => {
      toast.success("Статус обновлён");
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }
  if (q.isError) return <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>;

  const users = q.data?.users ?? [];
  const pending = users.filter((u) => u.approval_status === "pending");

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <PageHeader
        title="Пользователи и доступ"
        description="Новые регистрации требуют подтверждения. До одобрения пользователь видит экран ожидания и не имеет доступа к платформе."
      />

      <div className="text-sm text-muted-foreground">
        Ожидают подтверждения: <span className="font-semibold text-foreground">{pending.length}</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="text-left p-3">Пользователь</th>
              <th className="text-left p-3">Статус</th>
              <th className="text-left p-3 w-72">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.user_id} className="hover:bg-muted/20">
                <td className="p-3">
                  <div className="font-medium">{u.display_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email ?? u.user_id}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(u.created_at).toLocaleString()}
                  </div>
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      BADGE[u.approval_status] ?? BADGE.pending
                    }`}
                  >
                    {u.approval_status}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {u.approval_status !== "approved" && (
                      <Button
                        size="sm"
                        disabled={mutate.isPending}
                        onClick={() => mutate.mutate({ user_id: u.user_id, status: "approved" })}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Одобрить
                      </Button>
                    )}
                    {u.approval_status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutate.isPending}
                        onClick={() => mutate.mutate({ user_id: u.user_id, status: "rejected" })}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Отклонить
                      </Button>
                    )}
                    {u.approval_status === "rejected" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={mutate.isPending}
                        onClick={() => mutate.mutate({ user_id: u.user_id, status: "pending" })}
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" /> В ожидание
                      </Button>
                    )}
                    {u.approve_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(u.approve_url!);
                          toast.success("Ссылка одобрения скопирована");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" /> Ссылка
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
