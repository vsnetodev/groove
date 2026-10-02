import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

async function handle(request: Request): Promise<Response> {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return new Response("not configured", { status: 503 });
  const { readWebhookBody } = await import("@/server/payments/request.server");
  const { verifyMercadoPagoSignature } = await import("@/server/payments/mercadopago.server");
  let payload;
  try {
    payload = z
      .object({ type: z.string(), data: z.object({ id: z.union([z.string(), z.number()]) }) })
      .parse(JSON.parse(await readWebhookBody(request)));
  } catch (error) {
    return error instanceof Response ? error : new Response("invalid payload", { status: 400 });
  }
  if (payload.type !== "payment") return new Response("ignored", { status: 200 });
  const dataId = new URL(request.url).searchParams.get("data.id");
  if (!dataId || dataId !== String(payload.data.id) || !/^\d{1,40}$/.test(dataId)) {
    return new Response("invalid payment id", { status: 400 });
  }
  const valid = await verifyMercadoPagoSignature(
    secret,
    request.headers.get("x-signature"),
    request.headers.get("x-request-id"),
    dataId,
  );
  if (!valid) return new Response("invalid signature", { status: 401 });
  try {
    const { processMercadoPagoNotification } =
      await import("@/server/payments/mercadopago-webhook.server");
    await processMercadoPagoNotification({ type: payload.type, dataId });
    return Response.json({ received: true });
  } catch (error) {
    console.error("[mp-webhook] processing error", error);
    return new Response("processing error", { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
