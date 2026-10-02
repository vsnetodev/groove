import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Calendar, MapPin, User, CheckCircle2, Download, Printer } from "lucide-react";
import { formatDateLong } from "@/lib/format";
import logoUrl from "@/assets/logo.png";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { printTicket } from "@/lib/ticket-print";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tickets/$id")({
  head: () => ({ meta: [{ title: "Ingresso — Casa Groove" }] }),
  component: TicketDetail,
});

function TicketDetail() {
  const { id } = Route.useParams();
  const qrRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data: ticket, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!ticket) return null;
      const [{ data: event }, { data: batch }] = await Promise.all([
        supabase.from("events").select("*").eq("id", ticket.event_id).maybeSingle(),
        supabase.from("ticket_batches").select("*").eq("id", ticket.batch_id).maybeSingle(),
      ]);
      return { ticket, event, batch };
    },
  });

  if (isLoading) return <div className="p-20 text-center text-muted-foreground">Carregando...</div>;
  if (!data || !data.ticket) {
    return (
      <div className="mx-auto max-w-md p-20 text-center">
        <p className="text-muted-foreground">Ingresso não encontrado.</p>
        <Link to="/my-tickets" className="text-primary hover:underline mt-4 inline-block">
          ← Voltar
        </Link>
      </div>
    );
  }

  const { ticket, event, batch } = data;
  const isUsed = ticket.status === "checked_in";
  const isCancelled = ticket.status === "cancelled";

  const handlePrint = () => {
    const qrSvg = qrRef.current?.querySelector("svg")?.outerHTML;
    if (!qrSvg) {
      toast.error("QR Code indisponível para impressão.");
      return;
    }
    const ok = printTicket({
      eventTitle: event?.title ?? "Evento",
      batchName: batch?.name ?? null,
      dateLabel: event?.starts_at ? formatDateLong(event.starts_at) : null,
      venue: event?.venue ?? event?.city ?? null,
      holderName: ticket.holder_name,
      status: isUsed ? "Já utilizado" : isCancelled ? "Cancelado" : "Válido",
      codeLabel: ticket.secure_token,
      qrSvg,
      logoUrl: logoUrl,
    });
    if (!ok) toast.error("Permita janelas pop-up para baixar ou imprimir o ingresso.");
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Link
        to="/my-tickets"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Meus ingressos
      </Link>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[oklch(0.22_0.05_305)] to-[oklch(0.14_0.02_300)] p-6 shadow-[var(--shadow-card)] glow-primary">
        {/* Top: brand */}
        <div className="flex items-center justify-between mb-4">
          <img
            src={logoUrl}
            alt="Groove Produções"
            className="h-10 w-10 rounded-full ring-1 ring-primary/40"
          />
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Ingresso oficial
            </p>
            <p className="display text-lg tracking-wider">GROOVE produções</p>
          </div>
        </div>

        {/* Event */}
        <h1 className="display text-3xl leading-tight">{event?.title}</h1>
        <p className="text-sm text-primary mt-1">{batch?.name}</p>

        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm">
          {event && (
            <>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" /> {formatDateLong(event.starts_at)}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" /> {event.venue ?? event.city}
              </div>
            </>
          )}
          {ticket.holder_name && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" /> {ticket.holder_name}
            </div>
          )}
        </dl>

        {/* Perforation */}
        <div className="my-6 flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-background -ml-10" />
          <div className="flex-1 border-t border-dashed border-border/60" />
          <div className="h-4 w-4 rounded-full bg-background -mr-10" />
        </div>

        {/* QR */}
        <div className="flex flex-col items-center">
          <div
            ref={qrRef}
            className={`rounded-2xl bg-white p-4 ${isUsed || isCancelled ? "opacity-40" : ""}`}
          >
            <QRCodeSVG value={ticket.secure_token} size={200} level="H" />
          </div>
          <p className="mt-3 font-mono text-xs tracking-wider text-muted-foreground">
            {ticket.secure_token.slice(0, 8).toUpperCase()}…
            {ticket.secure_token.slice(-8).toUpperCase()}
          </p>

          {isUsed && (
            <div className="mt-4 flex items-center gap-2 rounded-full bg-flame/10 text-flame border border-flame/40 px-4 py-1.5 text-sm">
              <CheckCircle2 className="h-4 w-4" /> Já utilizado
              {ticket.checked_in_at && (
                <span className="text-xs text-muted-foreground ml-1">
                  {new Date(ticket.checked_in_at).toLocaleString("pt-BR")}
                </span>
              )}
            </div>
          )}
          {isCancelled && (
            <div className="mt-4 rounded-full bg-destructive/10 text-destructive border border-destructive/40 px-4 py-1.5 text-sm">
              Ingresso cancelado
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button
          onClick={handlePrint}
          className="bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)]"
        >
          <Download className="h-4 w-4" /> Baixar PDF
        </Button>
        <Button onClick={handlePrint} variant="outline">
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Guarde este QR. Ele é único e será validado na entrada. Para salvar em PDF, escolha "Salvar
        como PDF" na janela de impressão.
      </p>
    </main>
  );
}
