import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  cancelPendingOrder,
  createTicketCheckoutSession,
  readOrderBySession,
  type CheckoutResult,
  type OrderStatusView,
} from "@/server/payments/checkout.server";

import { checkoutSchema } from "./validation/checkout";
import { checkoutOrigin } from "@/server/payments/policy.server";

/** Cria a sessão de pagamento na Stripe. Preço, taxa e disponibilidade são sempre recalculados no servidor. */
export const createTicketCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => checkoutSchema.parse(input))
  .handler(async ({ data }): Promise<CheckoutResult> => {
    const request = getRequest();
    const origin = checkoutOrigin(request.url);
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

    return createTicketCheckoutSession({
      eventId: data.eventId,
      items: data.items,
      coupon: data.coupon,
      buyerName: data.buyerName,
      buyerEmail: data.buyerEmail,
      buyerPhone: data.buyerPhone,
      buyerDocument: data.buyerDocument,
      origin,
      accessToken,
    });
  });

/** Consulta somente leitura do status do pedido — nunca altera nada. */
export const getOrderBySession = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ sessionId: z.string().min(10).max(255) }).parse(input),
  )
  .handler(async ({ data }): Promise<OrderStatusView | null> => readOrderBySession(data.sessionId));

/** Libera a reserva quando o comprador desiste no checkout. Exige login e prova de que o pedido é do próprio usuário. */
export const cancelCheckoutOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const authHeader = getRequest().headers.get("authorization");
    const accessToken = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
    if (!accessToken) throw new Response("Unauthorized", { status: 401 });
    return cancelPendingOrder(data.orderId, accessToken);
  });
