import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Plus, ScanLine, Users, Settings, CreditCard } from "lucide-react";
import { useRoles, ROLE_LABEL } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isStaff = (roles ?? []).some(
      (r) => r.role === "admin" || r.role === "moderator" || r.role === "organizer",
    );
    if (!isStaff) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const { isAdmin, primaryRole } = useRoles();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Backstage</p>
          <h1 className="display text-4xl md:text-5xl mt-1">
            Painel do {ROLE_LABEL[primaryRole].toLowerCase()}
          </h1>
        </div>
      </div>
      <nav className="mb-8 flex flex-wrap gap-2 border-b border-border/40 pb-4">
        <NavPill
          to="/admin"
          active={pathname === "/admin"}
          icon={<LayoutDashboard className="h-4 w-4" />}
        >
          Dashboard
        </NavPill>
        <NavPill
          to="/admin/events/new"
          active={pathname.startsWith("/admin/events/new")}
          icon={<Plus className="h-4 w-4" />}
        >
          Novo evento
        </NavPill>
        <NavPill
          to="/admin/checkin"
          active={pathname.startsWith("/admin/checkin")}
          icon={<ScanLine className="h-4 w-4" />}
        >
          Check-in
        </NavPill>
        {isAdmin && (
          <NavPill
            to="/admin/users"
            active={pathname.startsWith("/admin/users")}
            icon={<Users className="h-4 w-4" />}
          >
            Usuários
          </NavPill>
        )}
        {isAdmin && (
          <NavPill
            to="/admin/payments"
            active={pathname.startsWith("/admin/payments")}
            icon={<CreditCard className="h-4 w-4" />}
          >
            Pagamentos
          </NavPill>
        )}
        {isAdmin && (
          <NavPill
            to="/admin/settings"
            active={pathname.startsWith("/admin/settings")}
            icon={<Settings className="h-4 w-4" />}
          >
            Configurações
          </NavPill>
        )}
      </nav>
      <Outlet />
    </div>
  );
}

function NavPill({
  to,
  children,
  active,
  icon,
}: {
  to: string;
  children: React.ReactNode;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {icon} {children}
    </Link>
  );
}
