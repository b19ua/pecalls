import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  listUsersWithRolesFn,
  assignRoleFn,
  revokeRoleFn,
} from "@/lib/admin-roles.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/admin/roles")({
  component: AdminRolesPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      {String((error as Error).message ?? "Error")}
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Не найдено</div>,
});

const ROLES = ["admin", "supervisor", "user"] as const;

function AdminRolesPage() {
  const listFn = useServerFn(listUsersWithRolesFn);
  const assignFn = useServerFn(assignRoleFn);
  const revokeFnCall = useServerFn(revokeRoleFn);
  const router = useRouter();

  const q = useQuery({
    queryKey: ["admin-users-roles"],
    queryFn: () => listFn(),
  });

  const [selection, setSelection] = useState<Record<string, string>>({});

  const assign = useMutation({
    mutationFn: (v: { user_id: string; role: (typeof ROLES)[number] }) => assignFn({ data: v }),
    onSuccess: () => {
      toast.success("Роль назначена");
      router.invalidate();
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (v: { user_id: string; role: (typeof ROLES)[number] }) => revokeFnCall({ data: v }),
    onSuccess: () => {
      toast.success("Роль снята");
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

  if (q.isError) {
    return <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>;
  }

  const users = q.data?.users ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <PageHeader
        title="Управление ролями"
        description="Назначайте роли пользователям. admin — полный доступ; supervisor — просмотр эскалированных заявок и логов ошибок."
      />


      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="text-left p-3">Пользователь</th>
              <th className="text-left p-3">Роли</th>
              <th className="text-left p-3 w-72">Назначить</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.user_id} className="hover:bg-muted/20">
                <td className="p-3">
                  <div className="font-medium">{u.display_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email ?? u.user_id}</div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 && (
                      <span className="text-xs text-muted-foreground">нет ролей</span>
                    )}
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                      >
                        {r}
                        <button
                          type="button"
                          className="hover:text-destructive"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate({ user_id: u.user_id, role: r })}
                          title="Снять роль"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Select
                      value={selection[u.user_id] ?? ""}
                      onValueChange={(v) => setSelection((s) => ({ ...s, [u.user_id]: v }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Выбрать роль" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!selection[u.user_id] || assign.isPending}
                      onClick={() => {
                        const role = selection[u.user_id] as (typeof ROLES)[number];
                        assign.mutate({ user_id: u.user_id, role });
                      }}
                    >
                      Добавить
                    </Button>
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
