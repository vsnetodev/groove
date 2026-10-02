import { stripeRequest, type StripeCheckoutSession } from "./stripe.server";
import { applyPaymentEvent, type PaymentAction } from "./events.server";
import type { Json } from "@/integrations/supabase/types";

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

export async function processStripeEvent(event: StripeEvent): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const object = event.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  let orderId: string | null = metadata.order_id ?? null;
  let action: PaymentAction = "ignore";
  let payload: Record<string, Json> = {};

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = await stripeRequest<StripeCheckoutSession>(
        `/checkout/sessions/${encodeURIComponent(String(object.id))}`,
        { method: "GET" },
      );
      orderId = session.metadata?.order_id ?? null;
      if (session.payment_status === "paid" && orderId) {
        action = "confirm";
        payload = {
          session_id: session.id,
          payment_intent: session.payment_intent,
          amount_total: session.amount_total,
          currency: session.currency,
        };
      }
      break;
    }
    case "checkout.session.expired":
      action = orderId ? "release" : "ignore";
      payload = { status: "expired", reason: event.type };
      break;
    case "checkout.session.async_payment_failed":
      action = orderId ? "release" : "ignore";
      payload = { status: "failed", reason: event.type };
      break;
    // A failed payment intent can still be retried inside the same Checkout session.
    case "charge.refunded": {
      // A partial refund must not invalidate every ticket in the order.
      if (object.refunded !== true || typeof object.payment_intent !== "string") break;
      const { data: order, error } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("stripe_payment_intent_id", object.payment_intent)
        .maybeSingle();
      if (error) throw error;
      orderId = order?.id ?? null;
      action = orderId ? "refund" : "ignore";
      break;
    }
  }
  await applyPaymentEvent({ key: event.id, type: event.type, orderId, action, payload });
}
