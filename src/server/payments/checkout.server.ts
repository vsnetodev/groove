import { maskEmail } from "./policy.server";
import { stripeRequest, type StripeCheckoutSession } from "./stripe.server";
import { mpRequest, type MpPreference } from "./mercadopago.server";

export type CheckoutInput = {
  eventId: string;
  items: { batch_id: string; quantity: number }[];
  coupon: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerDocument: string;
  origin: string;
  accessToken: string | null;
};

export type CheckoutResult = { url: string; orderId: string };

type ReserveResult = {
  order_id: string;
  subtotal_cents: number;
  discount_cents: number;
  fee_cents: number;
  total_cents: number;
  currency: string;
  lines: { name: string; quantity: number; unit_amount: number; batch_id: string }[];
};

export const RESERVE_ERROR_MESSAGES: Record<string, string> = {
  too_many_pending_orders: "Você já possui cinco pedidos pendentes. Aguarde ou cancele um deles.",
  event_not_available: "Este evento não está disponível para venda.",
  sales_not_started: "As vendas para este evento ainda não começaram.",
  sales_closed: "As vendas para este evento já encerraram.",
  batch_not_available: "Este lote não está mais disponível.",
  batch_closed: "As vendas deste lote encerraram.",
  batch_not_started: "As vendas deste lote ainda não começaram.",
  max_per_order_exceeded: "Você excedeu o limite de ingressos por compra deste lote.",
  sold_out: "Não há ingressos suficientes disponíveis neste lote.",
  invalid_quantity: "Quantidade inválida.",
  empty_cart: "Selecione ao menos um ingresso.",
  stripe_not_configured: "O pagamento ainda não está configurado. Fale com o organizador.",
  mercadopago_not_configured: "O pagamento ainda não está configurado. Fale com o organizador.",
};

function friendly(message: string): string {
  const key = Object.keys(RESERVE_ERROR_MESSAGES).find((k) => message.includes(k));
  return key
    ? RESERVE_ERROR_MESSAGES[key]!
    : "Não foi possível iniciar o pagamento. Tente novamente.";
}

export async function createTicketCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Liberate stale holds so the availability check is honest.
  const { error: expireError } = await supabaseAdmin.rpc("expire_stale_orders");
  if (expireError) throw new Error("Não foi possível verificar as reservas.");

  if (!input.accessToken) throw new Response("Unauthorized", { status: 401 });
  let userId: string | null = null;
  if (input.accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(input.accessToken);
    if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
    userId = data.user?.id ?? null;
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, title, status")
    .eq("id", input.eventId)
    .maybeSingle();
  if (eventError) throw new Error("Não foi possível carregar o evento.");
  if (!event) throw new Error(RESERVE_ERROR_MESSAGES["event_not_available"]!);

  const { data: reserved, error: reserveError } = await supabaseAdmin.rpc("reserve_tickets", {
    p_event_id: input.eventId,
    p_items: input.items,
    p_user_id: userId as string,
    p_buyer_name: input.buyerName,
    p_buyer_email: input.buyerEmail,
    p_buyer_phone: input.buyerPhone,
    p_buyer_document: input.buyerDocument,
    p_coupon_code: input.coupon,
    p_hold_minutes: 30,
  });
  if (reserveError) throw new Error(friendly(reserveError.message));

  const reservation = reserved as unknown as ReserveResult;
  const orderId = reservation.order_id;

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("payment_settings")
    .select("provider, environment, enabled")
    .eq("id", 1)
    .maybeSingle();
  const provider = settings?.provider === "mercadopago" ? "mercadopago" : "stripe";

  try {
    if (settingsError || !settings || !settings.enabled)
      throw new Error("payment_settings_unavailable");
    if (provider === "mercadopago") {
      const currencyId = (reservation.currency ?? "BRL").toUpperCase();
      const items =
        reservation.discount_cents > 0
          ? [
              {
                id: orderId,
                title: `Ingressos — ${event.title}`,
                quantity: 1,
                unit_price: reservation.total_cents / 100,
                currency_id: currencyId,
              },
            ]
          : reservation.lines.map((line) => ({
              id: line.batch_id,
              title: `${event.title} — ${line.name}`,
              quantity: line.quantity,
              unit_price: line.unit_amount / 100,
              currency_id: currencyId,
            }));

      const preference = await mpRequest<MpPreference>("/checkout/preferences", {
        method: "POST",
        idempotencyKey: `order_${orderId}`,
        body: {
          items,
          external_reference: orderId,
          metadata: { order_id: orderId, event_id: input.eventId },
          payer: { name: input.buyerName, email: input.buyerEmail },
          statement_descriptor: "CLUBEGROOVE",
          expires: true,
          expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          notification_url: `${input.origin}/api/public/webhooks/mercadopago`,
          auto_return: "approved",
          back_urls: {
            success: `${input.origin}/checkout/success?session_id=${orderId}`,
            pending: `${input.origin}/checkout/success?session_id=${orderId}`,
            failure: `${input.origin}/checkout/cancelled?order_id=${orderId}`,
          },
        },
      });

      const url =
        settings?.environment === "live"
          ? (preference.init_point ?? preference.sandbox_init_point)
          : (preference.sandbox_init_point ?? preference.init_point);
      if (!url) throw new Error("mercadopago_no_url");

      // Guardamos a referência do pedido para a página de sucesso consultar o status.
      await supabaseAdmin
        .from("orders")
        .update({ stripe_checkout_session_id: orderId })
        .eq("id", orderId)
        .throwOnError();

      return { url, orderId };
    }

    const currency = (reservation.currency ?? "BRL").toLowerCase();
    const lineItems =
      reservation.discount_cents > 0
        ? [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: reservation.total_cents,
                product_data: { name: `Ingressos — ${event.title}` },
              },
            },
          ]
        : reservation.lines.map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency,
              unit_amount: line.unit_amount,
              product_data: { name: `${event.title} — ${line.name}` },
            },
          }));

    const session = await stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
      body: {
        mode: "payment",
        line_items: lineItems,
        customer_email: input.buyerEmail,
        client_reference_id: orderId,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        metadata: {
          order_id: orderId,
          event_id: input.eventId,
          batch_ids: reservation.lines.map((l) => l.batch_id).join(","),
        },
        payment_intent_data: { metadata: { order_id: orderId, event_id: input.eventId } },
        success_url: `${input.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/checkout/cancelled?order_id=${orderId}`,
      },
      idempotencyKey: `order_${orderId}`,
    });

    if (!session.url) throw new Error("stripe_no_url");

    await supabaseAdmin
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", orderId)
      .throwOnError();

    return { url: session.url, orderId };
  } catch (error) {
    await supabaseAdmin.rpc("release_order", {
      p_order_id: orderId,
      p_status: "failed",
      p_reason: "checkout_session_creation_failed",
    });
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[checkout] failed to create session", message);
    throw new Error(friendly(message));
  }
}

export type OrderStatusView = {
  status: string;
  eventTitle: string | null;
  eventSlug: string | null;
  totalCents: number;
  currency: string;
  buyerEmail: string | null;
  ticketCount: number;
};

export async function readOrderBySession(sessionId: string): Promise<OrderStatusView | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const selectOrder = () =>
    supabaseAdmin
      .from("orders")
      .select("id, status, total_cents, currency, buyer_email, event_id")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();

  const { data: order } = await selectOrder();
  if (!order) return null;

  const [{ data: event }, { count }] = await Promise.all([
    supabaseAdmin.from("events").select("title, slug").eq("id", order.event_id).maybeSingle(),
    supabaseAdmin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id),
  ]);

  return {
    status: order.status,
    eventTitle: event?.title ?? null,
    eventSlug: event?.slug ?? null,
    totalCents: order.total_cents,
    currency: order.currency,
    buyerEmail: maskEmail(order.buyer_email),
    ticketCount: count ?? 0,
  };
}

export async function cancelPendingOrder(
  orderId: string,
  accessToken: string,
): Promise<{ ok: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData.user) throw new Response("Unauthorized", { status: 401 });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.user_id !== userData.user.id)
    throw new Response("Forbidden", { status: 403 });
  if (order.status !== "pending") return { ok: true };

  const { error } = await supabaseAdmin.rpc("release_order", {
    p_order_id: orderId,
    p_status: "cancelled",
    p_reason: "cancelled_by_buyer",
  });
  if (error) throw new Error("Não foi possível cancelar o pedido.");
  return { ok: true };
}
