import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { cancelCheckoutOrder } from "@/lib/checkout.functions";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export const Route = createFileRoute("/checkout/cancelled")({
  validateSearch: (search: Record<string, unknown>) => ({
    order_id: typeof search["order_id"] === "string" ? search["order_id"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Pagamento cancelado — Clube Groove" },
      {
        name: "description",
        content: "Sua compra foi cancelada e os ingressos voltaram para o estoque.",
      },
      { property: "og:title", content: "Pagamento cancelado — Clube Groove" },
      {
        property: "og:description",
        content: "Sua compra foi cancelada e os ingressos voltaram para o estoque.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutCancelled,
});

function CheckoutCancelled() {
  const { order_id } = Route.useSearch();
  const cancelOrder = useServerFn(cancelCheckoutOrder);
  const released = useRef(false);

  useEffect(() => {
    if (!order_id || released.current) return;
    released.current = true;
    void cancelOrder({ data: { orderId: order_id } }).catch(() => undefined);
  }, [order_id, cancelOrder]);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <XCircle className="h-10 w-10 text-destructive" />
      <h1 className="display mt-4 text-4xl">Pagamento cancelado</h1>
      <p className="mt-3 text-muted-foreground">
        Nenhuma cobrança foi feita e os ingressos reservados voltaram para o estoque. Você pode
        tentar de novo quando quiser.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">Voltar para os eventos</Link>
      </Button>
    </main>
  );
}
