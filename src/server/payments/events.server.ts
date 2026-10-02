import type { Json } from "@/integrations/supabase/types";

export type PaymentAction = "confirm" | "release" | "refund" | "ignore";

/** One database transaction commits both the business mutation and its receipt. */
export async function applyPaymentEvent(input: {
  key: string;
  type: string;
  orderId: string | null;
  action: PaymentAction;
  payload?: Record<string, Json>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("apply_payment_event_srv", {
    p_key: input.key,
    p_type: input.type,
    p_order_id: input.orderId,
    p_action: input.action,
    p_payload: input.payload ?? {},
  });
  if (error) throw new Error(`payment_event_failed: ${error.code}`);
  return data;
}
