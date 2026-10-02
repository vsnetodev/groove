import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateLong } from "@/lib/format";
import { Calendar, MapPin, QrCode, Ticket as TicketIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { z } from "zod";
import { QRCodeSVG } from "qrcode.react";

export const Route = createFileRoute("/_authenticated/my-tickets")({
  validateSearch: z.object({ order: z.string().optional() }),
  head: () => ({ meta: [{ title: "Meus ingressos — Casa Groove" }] }),
  component: MyTickets,
});

function MyTickets() {
  const { order } = useSearch({ from: "/_authenticated/my-tickets" });
  const { data, isLoading } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const { data: tickets, error } = await supabase
        .from("tickets")
        .select(
          "id,code,status,checked_in_at,holder_name,event_id,batch_id,order_id,created_at,secure_token",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!tickets || tickets.length === 0) return { tickets: [], events: {}, batches: {} };
      const eventIds = [...new Set(tickets.map((t) => t.event_id))];
      const batchIds = [...new Set(tickets.map((t) => t.batch_id))];
      const [{ data: events }, { data: batches }] = await Promise.all([
        supabase
          .from("events")
          .select("id,title,slug,cover_url,starts_at,venue,city")
          .in("id", eventIds),
        supabase.from("ticket_batches").select("id,name").in("id", batchIds),
      ]);
      return {
        tickets,
        events: Object.fromEntries((events ?? []).map((e) => [e.id, e])),
        batches: Object.fromEntries((batches ?? []).map((b) => [b.id, b])),
      };
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Sua noite</p>
        <h1 className="display text-4xl md:text-5xl mt-1">Meus ingressos</h1>
      </div>

      {order && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm"
        >
          Compra confirmada! Apresente o QR de cada ingresso na entrada.
        </motion.div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : !data || data.tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center">
          <TicketIcon className="mx-auto h-10 w-10 text-primary mb-3" />
          <p className="text-muted-foreground">Você ainda não tem ingressos. </p>
          <Link to="/" className="text-primary hover:underline mt-2 inline-block">
            Ver eventos
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.tickets.map((t) => {
            const ev = data.events[t.event_id];
            const b = data.batches[t.batch_id];
            return (
              <Link
                key={t.id}
                to="/tickets/$id"
                params={{ id: t.id }}
                className="group rounded-2xl border border-border/60 bg-card p-5 transition hover:border-primary/60 hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      #{t.id.slice(0, 8).toUpperCase()}
                    </p>
                    <h3 className="display text-2xl leading-tight tracking-wide mt-1">
                      {ev?.title ?? "Evento"}
                    </h3>
                    <p className="text-sm text-primary mt-1">{b?.name ?? "Ingresso"}</p>
                    {ev && (
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" /> {formatDateLong(ev.starts_at)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" /> {ev.venue ?? ev.city}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    {t.status === "checked_in" ? (
                      <Badge variant="outline" className="border-flame/50 text-flame">
                        Usado
                      </Badge>
                    ) : t.status === "cancelled" ? (
                      <Badge variant="destructive">Cancelado</Badge>
                    ) : t.secure_token ? (
                      <div className="rounded-xl bg-white p-2">
                        <QRCodeSVG value={t.secure_token} size={96} level="M" />
                      </div>
                    ) : (
                      <QrCode className="h-8 w-8 text-primary group-hover:scale-110 transition" />
                    )}
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Ver QR
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
