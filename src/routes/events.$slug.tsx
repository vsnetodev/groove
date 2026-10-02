import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Minus, Plus, Tag, Check, X, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { formatBRL, formatDateLong } from "@/lib/format";
import { useCommissionRate, feeCents } from "@/hooks/use-platform-settings";
import { useCoverUrl } from "@/hooks/use-cover-url";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { validateCoupon, type CouponValidation } from "@/lib/coupons.functions";

export const Route = createFileRoute("/events/$slug")({
  loader: async ({ params }) => {
    const { data: event } = await supabase
      .from("events")
      .select("*")
      .eq("slug", params.slug)
      .maybeSingle();
    return { event };
  },
  head: ({ loaderData }) => {
    const e = loaderData?.event;
    if (!e) return { meta: [{ title: "Evento — Casa Groove" }] };
    return {
      meta: [
        { title: `${e.title} — Casa Groove` },
        { name: "description", content: e.tagline ?? `Ingressos oficiais para ${e.title}` },
        { property: "og:title", content: e.title },
        { property: "og:description", content: e.tagline ?? "Ingressos oficiais Casa Groove" },
        ...(e.cover_url ? [{ property: "og:image", content: e.cover_url }] : []),
      ],
    };
  },
  component: EventDetail,
});

function useEvent(slug: string) {
  return useQuery({
    queryKey: ["event", slug],
    queryFn: async () => {
      const { data: event, error } = await supabase
        .from("events")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!event) return null;
      const { data: batches } = await supabase
        .from("ticket_batches")
        .select("*")
        .eq("event_id", event.id)
        .eq("active", true)
        .order("sort_order", { ascending: true });
      return { event, batches: batches ?? [] };
    },
    retry: 1,
  });
}

function EventDetail() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useEvent(slug);
  const cover = useCoverUrl(data?.event.cover_path, data?.event.cover_url);
  const { rate } = useCommissionRate();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [couponInput, setCouponInput] = useState("");
  const [couponData, setCouponData] = useState<{
    code: string;
    type: "percent" | "fixed";
    value: number;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const [buying, setBuying] = useState(false);

  const subtotal = useMemo(() => {
    if (!data) return 0;
    return data.batches.reduce((sum, b) => sum + (qty[b.id] ?? 0) * b.price_cents, 0);
  }, [qty, data]);

  const serviceFee = useMemo(() => {
    if (!data) return 0;
    return data.batches.reduce(
      (sum, b) => sum + (qty[b.id] ?? 0) * feeCents(b.price_cents, rate),
      0,
    );
  }, [qty, data, rate]);

  const discount = useMemo(() => {
    if (!couponData) return 0;
    if (couponData.type === "percent") return Math.floor((subtotal * couponData.value) / 100);
    return Math.min(couponData.value, subtotal);
  }, [couponData, subtotal]);

  const total = Math.max(subtotal - discount, 0) + serviceFee;
  const totalTickets = Object.values(qty).reduce((a, b) => a + b, 0);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 md:px-6">
        <div className="aspect-[21/9] w-full animate-pulse rounded-3xl bg-surface" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-flame" />
        <h1 className="display text-3xl">Não foi possível carregar o evento</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verifique sua conexão e tente novamente.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="display text-4xl">Evento não encontrado</h1>
        <Button asChild className="mt-6">
          <Link to="/">Voltar aos eventos</Link>
        </Button>
      </div>
    );
  }

  const { event, batches } = data;

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setApplying(true);
    let c: CouponValidation | null = null;
    try {
      c = await validateCoupon({ data: { eventId: event.id, code: couponInput.trim() } });
    } catch {
      c = null;
    }
    setApplying(false);
    if (!c?.ok) {
      if (c?.reason === "exhausted") return toast.error("Cupom esgotado");
      if (c?.reason === "expired") return toast.error("Cupom expirado");
      return toast.error("Cupom inválido");
    }
    setCouponData({ code: c.code!, type: c.discount_type!, value: c.discount_value! });
    toast.success("Cupom aplicado!");
  };

  const goToCheckout = async () => {
    if (totalTickets === 0) return toast.error("Selecione ao menos 1 ingresso");
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      // Save cart in sessionStorage
      sessionStorage.setItem(
        "casa-groove-cart",
        JSON.stringify({ slug, qty, coupon: couponData?.code ?? "" }),
      );
      navigate({ to: "/auth", search: { next: `/events/${slug}` } });
      return;
    }
    setBuying(true);
    sessionStorage.setItem(
      "casa-groove-cart",
      JSON.stringify({ slug, qty, coupon: couponData?.code ?? "" }),
    );
    navigate({ to: "/checkout/$slug", params: { slug } });
    setBuying(false);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
        <div className="aspect-[21/9] w-full overflow-hidden bg-surface">
          {cover ? (
            <img
              src={cover}
              alt={`Capa do evento ${event.title}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/40 to-accent/40" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <Badge variant="outline" className="border-primary/50 bg-primary/10 text-primary mb-3">
            {event.city ?? "Casa Groove"}
          </Badge>
          <h1 className="display text-4xl md:text-7xl tracking-tight max-w-3xl">{event.title}</h1>
          {event.tagline && (
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl">{event.tagline}</p>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* LEFT: info + description */}
        <div>
          <div className="grid gap-4 sm:grid-cols-2 mb-8">
            <InfoTile
              icon={<Calendar className="h-4 w-4" />}
              label="Quando"
              value={formatDateLong(event.starts_at)}
            />
            <InfoTile
              icon={<MapPin className="h-4 w-4" />}
              label="Onde"
              value={[event.venue, event.city].filter(Boolean).join(" · ") || "Local a divulgar"}
            />
          </div>
          {event.description && (
            <div className="prose prose-invert max-w-none">
              <h2 className="display text-3xl">Sobre a noite</h2>
              <p className="text-muted-foreground whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
        </div>

        {/* RIGHT: batches sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]"
          >
            <h3 className="display text-2xl mb-4">Ingressos</h3>
            {batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingressos em breve.</p>
            ) : (
              <ul className="space-y-3">
                {batches.map((b) => {
                  const soldOut = b.sold >= b.quantity;
                  const closed = b.sales_end && new Date(b.sales_end) < new Date();
                  const q = qty[b.id] ?? 0;
                  const remaining = b.quantity - b.sold;
                  return (
                    <li
                      key={b.id}
                      className={`rounded-xl border border-border/50 bg-surface p-4 ${soldOut || closed ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{b.name}</p>
                          {b.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{b.description}</p>
                          )}
                          <p className="mt-1 text-lg font-bold text-gradient-primary">
                            {formatBRL(b.price_cents)}
                          </p>
                          {rate > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              + {formatBRL(feeCents(b.price_cents, rate))} de taxa de serviço (
                              {rate}%)
                            </p>
                          )}
                          {remaining <= 20 && !soldOut && !closed && (
                            <p className="text-xs text-flame mt-0.5">Restam {remaining}</p>
                          )}
                        </div>
                        {soldOut ? (
                          <Badge variant="destructive">Esgotado</Badge>
                        ) : closed ? (
                          <Badge variant="outline">Encerrado</Badge>
                        ) : (
                          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-1 py-1">
                            <button
                              onClick={() => setQty({ ...qty, [b.id]: Math.max(0, q - 1) })}
                              disabled={q === 0}
                              className="grid h-7 w-7 place-items-center rounded-full hover:bg-surface-hi disabled:opacity-30"
                              type="button"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center font-mono text-sm">{q}</span>
                            <button
                              onClick={() => setQty({ ...qty, [b.id]: Math.min(remaining, q + 1) })}
                              disabled={q >= remaining}
                              className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30"
                              type="button"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Coupon */}
            {batches.length > 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-border/60 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Tag className="h-3.5 w-3.5" /> Cupom de desconto
                </div>
                {couponData ? (
                  <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 text-primary">
                      <Check className="h-4 w-4" /> {couponData.code}
                    </span>
                    <button
                      onClick={() => setCouponData(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="CÓDIGO"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      className="h-9 uppercase font-mono"
                    />
                    <Button variant="outline" size="sm" onClick={applyCoupon} disabled={applying}>
                      Aplicar
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            {batches.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-border/40 pt-4 text-sm">
                <Row label="Subtotal" value={formatBRL(subtotal)} />
                {discount > 0 && (
                  <Row label="Desconto" value={`- ${formatBRL(discount)}`} className="text-flame" />
                )}
                {serviceFee > 0 && (
                  <Row label={`Taxa de serviço (${rate}%)`} value={formatBRL(serviceFee)} />
                )}
                <Row label="Total" value={formatBRL(total)} className="text-lg font-bold pt-1" />
                <Button
                  onClick={goToCheckout}
                  disabled={totalTickets === 0 || buying}
                  className="mt-3 w-full bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)] hover:opacity-90 glow-primary"
                  size="lg"
                >
                  {totalTickets === 0
                    ? "Selecione ingressos"
                    : `Comprar ${totalTickets} ingresso${totalTickets > 1 ? "s" : ""}`}
                </Button>
              </div>
            )}
          </motion.div>
        </aside>
      </div>
    </main>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1.5 font-medium">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
