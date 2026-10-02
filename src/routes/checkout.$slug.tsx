import { z } from "zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTicketCheckout } from "@/lib/checkout.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { useCommissionRate, feeCents } from "@/hooks/use-platform-settings";
import { CreditCard, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/checkout/$slug")({
  head: () => ({
    meta: [
      { title: "Checkout — Clube Groove" },
      {
        name: "description",
        content: "Finalize a compra dos seus ingressos com pagamento seguro.",
      },
      { property: "og:title", content: "Checkout — Clube Groove" },
      {
        property: "og:description",
        content: "Finalize a compra dos seus ingressos com pagamento seguro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Checkout,
});

type Cart = { slug: string; qty: Record<string, number>; coupon: string };

function Checkout() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [cart, setCart] = useState<Cart | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { rate } = useCommissionRate();
  const startCheckout = useServerFn(createTicketCheckout);

  useEffect(() => {
    const raw = sessionStorage.getItem("casa-groove-cart");
    if (!raw) {
      navigate({ to: "/events/$slug", params: { slug } });
      return;
    }
    try {
      const parsed = z
        .object({
          slug: z.literal(slug),
          qty: z.record(z.string().uuid(), z.number().int().min(0).max(50)),
          coupon: z.string().max(50),
        })
        .parse(JSON.parse(raw));
      if (Object.keys(parsed.qty).length > 10) throw new Error("invalid_cart");
      setCart(parsed);
    } catch {
      sessionStorage.removeItem("casa-groove-cart");
      navigate({ to: "/events/$slug", params: { slug } });
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth", search: { next: `/events/${slug}` } });
        return;
      }
      setEmail(data.user.email ?? "");
      supabase
        .from("profiles")
        .select("full_name,phone")
        .eq("id", data.user.id)
        .maybeSingle()
        .then(({ data: p }) => {
          if (p?.full_name) setName(p.full_name);
          if (p?.phone) setPhone(p.phone);
        });
    });
  }, [slug, navigate]);

  const { data } = useQuery({
    queryKey: ["checkout-event", slug],
    queryFn: async () => {
      const { data: event } = await supabase
        .from("events")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (!event) return null;
      const { data: batches } = await supabase
        .from("ticket_batches")
        .select("*")
        .eq("event_id", event.id);
      return { event, batches: batches ?? [] };
    },
  });

  if (!cart || !data) {
    return <div className="p-20 text-center text-muted-foreground">Carregando...</div>;
  }

  const { event, batches } = data;
  const lineItems = batches
    .map((b) => ({ batch: b, qty: cart.qty[b.id] ?? 0 }))
    .filter((li) => li.qty > 0);
  const subtotal = lineItems.reduce((s, li) => s + li.batch.price_cents * li.qty, 0);
  const serviceFee = lineItems.reduce(
    (s, li) => s + feeCents(li.batch.price_cents, rate) * li.qty,
    0,
  );
  const total = subtotal + serviceFee;
  const totalTickets = lineItems.reduce((s, li) => s + li.qty, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const items = lineItems.map((li) => ({ batch_id: li.batch.id, quantity: li.qty }));

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from("profiles").upsert({ id: userData.user.id, full_name: name, phone });
      }

      const { url } = await startCheckout({
        data: {
          eventId: event.id,
          items,
          coupon: cart.coupon || "",
          buyerName: name,
          buyerEmail: email,
          buyerPhone: phone,
          buyerDocument: document,
        },
      });

      sessionStorage.removeItem("casa-groove-cart");
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao iniciar o pagamento";
      toast.error(message);
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
      <Link
        to="/events/$slug"
        params={{ slug }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <h1 className="display text-4xl md:text-5xl mb-2">Checkout</h1>
      <p className="text-muted-foreground mb-8">{event.title}</p>

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border/60 bg-card p-6 space-y-5"
        >
          <h2 className="display text-2xl">Dados do comprador</h2>
          <div>
            <Label htmlFor="name">Nome completo</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 90000-0000"
            />
          </div>
          <div>
            <Label htmlFor="document">CPF (opcional)</Label>
            <Input
              id="document"
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="000.000.000-00"
            />
          </div>

          <div className="rounded-xl border border-dashed border-border/60 p-4">
            <div className="flex items-center gap-2 mb-2 text-sm">
              <CreditCard className="h-4 w-4 text-primary" /> Pagamento
            </div>
            <p className="text-xs text-muted-foreground">
              Você será redirecionado para o ambiente seguro do Mercado Pago para pagar com cartão
              de crédito, débito ou Pix. Seus ingressos são liberados assim que o pagamento for
              confirmado.
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)] hover:opacity-90 glow-primary"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Redirecionando para o pagamento
              </>
            ) : (
              `Ir para o pagamento • ${formatBRL(total)}`
            )}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Pagamento processado com segurança pelo Mercado
            Pago
          </p>
        </motion.form>

        <aside className="rounded-2xl border border-border/60 bg-card p-6 h-fit md:sticky md:top-24">
          <h3 className="display text-xl mb-4">Resumo</h3>
          <ul className="space-y-2 text-sm">
            {lineItems.map((li) => (
              <li key={li.batch.id} className="flex justify-between">
                <span>
                  {li.qty}× {li.batch.name}
                </span>
                <span className="font-mono">{formatBRL(li.batch.price_cents * li.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border/40 pt-4 space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total ingressos</span>
              <span>{totalTickets}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-mono">{formatBRL(subtotal)}</span>
            </div>
            {serviceFee > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Taxa de serviço ({rate}%)</span>
                <span className="font-mono">{formatBRL(serviceFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-1">
              <span>Total</span>
              <span className="text-gradient-primary">{formatBRL(total)}</span>
            </div>
            {cart.coupon && (
              <p className="text-xs text-flame">Cupom {cart.coupon} será aplicado.</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
