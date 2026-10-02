import { z } from "zod";

export const checkoutSchema = z.object({
  eventId: z.string().uuid(),
  items: z
    .array(z.object({ batch_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) }))
    .min(1)
    .max(10)
    .refine(
      (items) => new Set(items.map((item) => item.batch_id)).size === items.length,
      "Lotes duplicados não são permitidos.",
    )
    .transform((items) => [...items].sort((a, b) => a.batch_id.localeCompare(b.batch_id))),
  coupon: z.string().trim().max(50).default(""),
  buyerName: z.string().trim().min(2).max(120),
  buyerEmail: z.string().trim().email().max(255),
  buyerPhone: z.string().trim().max(40).default(""),
  buyerDocument: z.string().trim().max(40).default(""),
});
