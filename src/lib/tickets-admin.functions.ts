import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Privileged ticket/event operations. The underlying SECURITY DEFINER routines are
 * only executable by the service role; the acting user is verified here through the
 * auth middleware and passed explicitly, and every routine re-checks the role and
 * event ownership of that actor before mutating anything.
 */

export type RpcResult = {
  ok: boolean;
  reason?: string;
  already?: boolean;
  tickets_cancelled?: number;
  holder_name?: string;
  event_title?: string;
  batch_name?: string;
  checked_in_at?: string;
  order_id?: string;
  quantity?: number;
  email?: string;
  total_cents?: number;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const checkInSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  code: z.string().trim().uuid().optional(),
  eventId: z.string().uuid().optional(),
});

export const checkInTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => checkInSchema.parse(data))
  .handler(async ({ data, context }): Promise<RpcResult> => {
    const db = await admin();
    if (!data.token && !data.code) return { ok: false, reason: "not_found" };
    const { data: res, error } = data.token
      ? await db.rpc("check_in_ticket_token_srv", {
          p_actor: context.userId,
          p_token: data.token,
          ...(data.eventId ? { p_event_id: data.eventId } : {}),
        })
      : await db.rpc("check_in_ticket_srv", { p_actor: context.userId, p_code: data.code! });
    if (error) throw new Error(error.message);
    return (res as RpcResult) ?? { ok: false, reason: "not_found" };
  });

export const cancelEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ eventId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<RpcResult> => {
    const db = await admin();
    const { data: res, error } = await db.rpc("cancel_event_srv", {
      p_actor: context.userId,
      p_event_id: data.eventId,
    });
    if (error) throw new Error(error.message);
    return (res as RpcResult) ?? { ok: false };
  });

export const cancelTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<RpcResult> => {
    const db = await admin();
    const { data: res, error } = await db.rpc("cancel_ticket_srv", {
      p_actor: context.userId,
      p_ticket_id: data.ticketId,
    });
    if (error) throw new Error(error.message);
    return (res as RpcResult) ?? { ok: false };
  });

export const issueCourtesyTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        userId: z.string().uuid(),
        batchId: z.string().uuid(),
        quantity: z.number().int().min(1).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<RpcResult> => {
    const db = await admin();
    const { data: res, error } = await db.rpc("issue_courtesy_tickets_srv", {
      p_actor: context.userId,
      p_event_id: data.eventId,
      p_user_id: data.userId,
      p_batch_id: data.batchId,
      p_quantity: data.quantity,
    });
    if (error) throw new Error(error.message);
    return (res as RpcResult) ?? { ok: false };
  });

export const issueExternalPaidTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        userId: z.string().uuid(),
        batchId: z.string().uuid(),
        quantity: z.number().int().min(1).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<RpcResult> => {
    const db = await admin();
    const { data: res, error } = await db.rpc("issue_external_paid_tickets_srv", {
      p_actor: context.userId,
      p_event_id: data.eventId,
      p_user_id: data.userId,
      p_batch_id: data.batchId,
      p_quantity: data.quantity,
    });
    if (error) throw new Error(error.message);
    return (res as RpcResult) ?? { ok: false };
  });

export const refundOrderManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<RpcResult> => {
    const db = await admin();
    const { data: res, error } = await db.rpc("admin_refund_order_srv", {
      p_actor: context.userId,
      p_order_id: data.orderId,
    });
    if (error) throw new Error(error.message);
    return (res as RpcResult) ?? { ok: false };
  });
