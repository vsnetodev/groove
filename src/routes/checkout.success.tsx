import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrderBySession } from "@/lib/checkout.functions";
import { CheckCircle2, Loader2, Ticket, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/checkout/success")({
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search["session_id"] === "string" ? search["session_id"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Pagamento confirmado — Clube Groove" },
      {
        name: "description",
        content: "Acompanhe a confirmação do seu pagamento e acesse seus ingressos.",
      },
      { property: "og:title", content: "Pagamento confirmado — Clube Groove" },
      {
        property: "og:description",
        content: "Acompanhe a confirmação do seu pagamento e acesse seus ingressos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutSuccess,
});

function CheckoutSuccess() {
  const { session_id } = Route.useSearch();
  const fetchOrder = useServerFn(getOrderBySession);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["checkout-session", session_id],
    enabled: session_id.length > 0,
    queryFn: () => fetchOrder({ data: { sessionId: session_id } }),
    // O webhook da Stripe pode levar alguns segundos; consultamos até confirmar.
    retry: 2,
    refetchInterval: (query) => {
      if (query.state.error || query.state.data === null || query.state.dataUpdateCount >= 40)
        return false;
      return ["paid", "refunded", "cancelled", "failed", "expired"].includes(
        query.state.data?.status ?? "",
      )
        ? false
        : 3000;
    },
  });

  if (!session_id) {
    return (
      <Shell icon={<AlertTriangle className="h-10 w-10 text-flame" />} title="Sessão não informada">
        <p className="text-muted-foreground">Não encontramos a referência do pagamento.</p>
      </Shell>
    );
  }

  if (isError || (!isLoading && !data)) {
    return (
      <Shell
        icon={<AlertTriangle className="h-10 w-10 text-flame" />}
        title="Não foi possível consultar o pedido"
      >
        <p>Confira a referência do pagamento ou tente atualizar a página.</p>
      </Shell>
    );
  }
  if (isLoading || !data) {
    return (
      <Shell
        icon={<Loader2 className="h-10 w-10 animate-spin text-primary" />}
        title="Confirmando pagamento"
      >
        <p className="text-muted-foreground">
          Aguarde enquanto confirmamos a transação com a operadora.
        </p>
      </Shell>
    );
  }

  if (["refunded", "cancelled", "failed", "expired"].includes(data.status)) {
    return (
      <Shell icon={<AlertTriangle className="h-10 w-10 text-flame" />} title="Pedido encerrado">
        <p>
          Status: {data.status}. Se houve cobrança, contate o organizador com a referência do
          pedido.
        </p>
      </Shell>
    );
  }
  if (data.status !== "paid") {
    return (
      <Shell
        icon={<Loader2 className="h-10 w-10 animate-spin text-primary" />}
        title="Pagamento em processamento"
      >
        <p className="text-muted-foreground">
          Recebemos sua compra e estamos aguardando a confirmação da operadora. A consulta
          automática é limitada a dois minutos; depois, atualize a página.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Status atual: {data.status}</p>
      </Shell>
    );
  }

  return (
    <Shell icon={<CheckCircle2 className="h-10 w-10 text-primary" />} title="Pagamento confirmado">
      <p className="text-muted-foreground">
        {data.ticketCount} ingresso{data.ticketCount === 1 ? "" : "s"} para{" "}
        <span className="text-foreground">{data.eventTitle}</span> — total de{" "}
        {formatBRL(data.totalCents)}.
      </p>
      {data.buyerEmail && (
        <p className="mt-2 text-xs text-muted-foreground">
          E-mail informado na compra: {data.buyerEmail}.
        </p>
      )}
      <Button asChild className="mt-6 bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)]">
        <Link to="/my-tickets">
          <Ticket className="h-4 w-4" /> Ver meus ingressos
        </Link>
      </Button>
    </Shell>
  );
}

function Shell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      {icon}
      <h1 className="display mt-4 text-4xl">{title}</h1>
      <div className="mt-3">{children}</div>
    </main>
  );
}
