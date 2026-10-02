import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowUpRight, Ticket, DollarSign, Users, TrendingUp } from "lucide-react";
import { formatBRL, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const [{ data: events }, { data: orders }, { count: ticketCount }] = await Promise.all([
        supabase.from("events").select("*").order("starts_at", { ascending: false }),
        supabase.from("orders").select("event_id,total_cents,status").eq("status", "paid"),
        supabase.from("tickets").select("*", { count: "exact", head: true }),
      ]);
      const revenue = (orders ?? []).reduce((s, o) => s + o.total_cents, 0);
      const byEvent: Record<string, { revenue: number; orders: number }> = {};
      for (const o of orders ?? []) {
        const cur = byEvent[o.event_id] ?? { revenue: 0, orders: 0 };
        cur.revenue += o.total_cents;
        cur.orders += 1;
        byEvent[o.event_id] = cur;
      }
      return {
        events: events ?? [],
        revenue,
        totalOrders: orders?.length ?? 0,
        totalTickets: ticketCount ?? 0,
        byEvent,
      };
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label="Faturamento"
          value={formatBRL(data.revenue)}
        />
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Pedidos pagos"
          value={data.totalOrders.toString()}
        />
        <Stat
          icon={<Ticket className="h-4 w-4" />}
          label="Ingressos emitidos"
          value={data.totalTickets.toString()}
        />
      </div>

      {/* Events */}
      <div>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="display text-3xl">Eventos</h2>
          <Button asChild variant="outline">
            <Link to="/admin/events/new">Novo evento</Link>
          </Button>
        </div>
        {data.events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center">
            <TrendingUp className="mx-auto h-8 w-8 text-primary mb-3" />
            <p className="text-muted-foreground">Nenhum evento ainda.</p>
            <Button asChild className="mt-4">
              <Link to="/admin/events/new">Criar meu primeiro evento</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {data.events.map((e) => {
              const stats = data.byEvent[e.id] ?? { revenue: 0, orders: 0 };
              return (
                <li key={e.id}>
                  <Link
                    to="/admin/events/$id"
                    params={{ id: e.id }}
                    className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4 transition hover:border-primary/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="display text-xl truncate">{e.title}</h3>
                        <StatusBadge status={e.status} />
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" /> {formatDateTime(e.starts_at)}
                      </p>
                    </div>
                    <div className="hidden sm:block text-right shrink-0">
                      <p className="display text-xl text-gradient-primary">
                        {formatBRL(stats.revenue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {stats.orders} pedido{stats.orders === 1 ? "" : "s"} pago
                        {stats.orders === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-2 display text-3xl text-gradient-primary">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Rascunho", className: "border-muted-foreground/40 text-muted-foreground" },
    published: { label: "No ar", className: "border-primary/50 text-primary bg-primary/10" },
    ended: { label: "Encerrado", className: "border-border text-muted-foreground" },
    cancelled: { label: "Cancelado", className: "border-destructive/50 text-destructive" },
  };
  const s = map[status] ?? map.draft;
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  );
}
