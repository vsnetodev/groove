import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) {
          console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured");
          return new Response("not configured", { status: 500 });
        }

        const { readWebhookBody } = await import("@/server/payments/request.server");
        let rawBody: string;
        try {
          rawBody = await readWebhookBody(request);
        } catch (error) {
          if (error instanceof Response) return error;
          throw error;
        }
        const { verifyStripeSignature } = await import("@/server/payments/stripe.server");
        const valid = await verifyStripeSignature(
          rawBody,
          request.headers.get("stripe-signature"),
          secret,
        );
        if (!valid) return new Response("invalid signature", { status: 400 });

        let event: { id: string; type: string; data: { object: Record<string, unknown> } };
        try {
          event = z
            .object({
              id: z.string().min(1).max(255),
              type: z.string().min(1).max(255),
              data: z.object({ object: z.record(z.unknown()) }),
            })
            .parse(JSON.parse(rawBody));
        } catch {
          return new Response("invalid payload", { status: 400 });
        }

        try {
          const { processStripeEvent } = await import("@/server/payments/webhook.server");
          await processStripeEvent(event);
        } catch (error) {
          console.error("[stripe-webhook] processing error", error);
          return new Response("processing error", { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
