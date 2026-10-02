import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  eventId: z.string().uuid(),
  code: z.string().trim().min(1).max(64),
});

export type CouponValidation = {
  ok: boolean;
  reason?: string;
  code?: string;
  discount_type?: "percent" | "fixed";
  discount_value?: number;
};

/**
 * Server-side coupon validation. The underlying SECURITY DEFINER function is not
 * executable by anon/authenticated roles; only this validated server entry point
 * can call it, and it returns nothing beyond the discount actually applied.
 */
export const validateCoupon = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<CouponValidation> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("validate_coupon", {
      p_event_id: data.eventId,
      p_code: data.code,
    });
    if (error) return { ok: false, reason: "invalid" };
    const c = result as CouponValidation | null;
    if (!c?.ok) return { ok: false, reason: c?.reason ?? "invalid" };
    return {
      ok: true,
      code: c.code,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
    };
  });
