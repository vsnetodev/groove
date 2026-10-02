import { mpRequest, type MpPayment } from "./mercadopago.server";
import { applyPaymentEvent, type PaymentAction } from "./events.server";
import type { Json } from "@/integrations/supabase/types";

type Notification = { type: string; dataId: string };

export async function processMercadoPagoNotification(note: Notification): Promise<void> {
  if (note.type !== "payment") return;
  const payment = await mpRequest<MpPayment>(`/v1/payments/${encodeURIComponent(note.dataId)}`);
  const orderId = payment.external_reference || String(payment.metadata?.order_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) return;
  let action: PaymentAction = "ignore";
  let payload: Record<string, Json> = { status: payment.status };
  if (payment.status === "approved") {
    action = "confirm";
    payload = {
      session_id: orderId,
      payment_intent: String(payment.id),
      amount_total: Math.round(payment.transaction_amount * 100),
      currency: payment.currency_id ?? "BRL",
    };
  } else if (["refunded", "charged_back"].includes(payment.status)) {
    action = "refund";
  }
  // Rejected attempts do not cancel a preference that the buyer may retry.
  await applyPaymentEvent({
    key: `mp_payment_${payment.id}_${payment.status}`,
    type: `mercadopago.${payment.status}`,
    orderId,
    action,
    payload,
  });
}
