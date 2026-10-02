import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listUsers, setUserRole, setUserBanned, deleteUser } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ROLE_LABEL, type AppRole } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/admin/users")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/admin" });
  },
  component: UsersPage,
});

const ROLES: AppRole[] = ["admin", "moderator", "organizer", "user"];

function UsersPage() {
  const fetchUsers = useServerFn(listUsers);
  const changeRole = useServerFn(setUserRole);
  const changeBanned = useServerFn(setUserBanned);
  const removeUser = useServerFn(deleteUser);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: AppRole }) => changeRole({ data: vars }),
    onSuccess: () => {
      toast.success("Papel atualizado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Não foi possível alterar o papel"),
  });

  const banMutation = useMutation({
    mutationFn: (vars: { userId: string; banned: boolean }) => changeBanned({ data: vars }),
    onSuccess: () => {
      toast.success("Status da conta atualizado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Não foi possível atualizar a conta"),
  });

  const deleteMutation = useMutation({
    mutationFn: (vars: { userId: string }) => removeUser({ data: vars }),
    onSuccess: () => {
      toast.success("Conta excluída");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Não foi possível excluir a conta"),
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando usuários...</p>;

  return (
    <div className="space-y-4">
      <h2 className="display text-3xl">Usuários</h2>
      <ul className="space-y-2">
        {(data ?? []).map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3"
          >
            <div className="min-w-48">
              <p className="font-medium">{u.full_name ?? u.email}</p>
              <p className="text-xs text-muted-foreground">{u.email}</p>
              <div className="mt-1 flex gap-1.5">
                {!u.confirmed && (
                  <Badge variant="outline" className="border-accent/50 text-accent">
                    E-mail não confirmado
                  </Badge>
                )}
                {u.banned && <Badge variant="destructive">Desativado</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r}
                  disabled={roleMutation.isPending}
                  onClick={() => roleMutation.mutate({ userId: u.id, role: r })}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    u.role === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
              <Button
                size="sm"
                variant={u.banned ? "outline" : "ghost"}
                disabled={banMutation.isPending}
                onClick={() => banMutation.mutate({ userId: u.id, banned: !u.banned })}
              >
                {u.banned ? "Reativar" : "Desativar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={deleteMutation.isPending}
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (
                    confirm(
                      `Excluir definitivamente a conta ${u.email}? Esta ação não pode ser desfeita.`,
                    )
                  )
                    deleteMutation.mutate({ userId: u.id });
                }}
              >
                Excluir
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
