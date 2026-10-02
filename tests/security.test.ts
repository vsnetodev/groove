import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "../src/server/payments/stripe.server";
import { verifyMercadoPagoSignature } from "../src/server/payments/mercadopago.server";
import { readWebhookBody } from "../src/server/payments/request.server";
import { checkoutOrigin, maskEmail } from "../src/server/payments/policy.server";
import { assertPublicKey } from "../src/integrations/supabase/public-key";
import { checkoutSchema } from "../src/lib/validation/checkout";

const sign = (value: string) => createHmac("sha256", "test-secret").update(value).digest("hex");
test("Stripe accepts valid signatures and rotated secrets; rejects tampering and stale replay", async () => {
  const body = '{"id":"evt_test"}';
  const now = Math.floor(Date.now() / 1000);
  const header = `t=${now},v1=wrong,v1=${sign(`${now}.${body}`)}`;
  assert.equal(await verifyStripeSignature(body, header, "test-secret"), true);
  assert.equal(await verifyStripeSignature(body + " ", header, "test-secret"), false);
  const old = now - 601;
  assert.equal(
    await verifyStripeSignature(body, `t=${old},v1=${sign(`${old}.${body}`)}`, "test-secret"),
    false,
  );
  assert.equal(await verifyStripeSignature(body, null, "test-secret"), false);
});
test("Mercado Pago verifies request id, data id and timestamp", async () => {
  const ts = String(Date.now());
  const header = `ts=${ts},v1=${sign(`id:123;request-id:req;ts:${ts};`)}`;
  assert.equal(await verifyMercadoPagoSignature("test-secret", header, "req", "123"), true);
  assert.equal(await verifyMercadoPagoSignature("test-secret", header, "req", "124"), false);
  assert.equal(await verifyMercadoPagoSignature("test-secret", header, "other", "123"), false);
});
test("webhook body limit works even without content-length", async () => {
  assert.equal(
    await readWebhookBody(new Request("http://localhost", { method: "POST", body: "hello" }), 5),
    "hello",
  );
  await assert.rejects(
    readWebhookBody(new Request("http://localhost", { method: "POST", body: "abcdef" }), 5),
    (error: unknown) => error instanceof Response && error.status === 413,
  );
});
test("checkout rejects duplicate batches and sorts lock order", () => {
  const a = "00000000-0000-4000-8000-000000000001";
  const b = "00000000-0000-4000-8000-000000000002";
  const input = {
    eventId: a,
    buyerName: "Teste",
    buyerEmail: "teste@example.com",
    items: [
      { batch_id: b, quantity: 1 },
      { batch_id: a, quantity: 2 },
    ],
  };
  assert.equal(checkoutSchema.parse(input).items[0].batch_id, a);
  assert.throws(() => checkoutSchema.parse({ ...input, items: [input.items[0], input.items[0]] }));
  assert.throws(() => checkoutSchema.parse({ ...input, items: [{ batch_id: a, quantity: -1 }] }));
});
test("public keys reject service role and malformed JWTs", () => {
  const jwt = (role: string) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.doesNotThrow(() => assertPublicKey(jwt("anon")));
  assert.doesNotThrow(() => assertPublicKey("sb_publishable_example"));
  assert.throws(() => assertPublicKey(jwt("service_role")));
  assert.throws(() => assertPublicKey("sb_secret_example"));
  assert.throws(() => assertPublicKey("invalid"));
});
test("checkout URL is canonical and public status masks buyer email", () => {
  const previous = process.env.APP_URL;
  try {
    delete process.env.APP_URL;
    assert.throws(() => checkoutOrigin("https://attacker.example"));
    assert.equal(checkoutOrigin("http://localhost:3000"), "http://localhost:3000");
    process.env.APP_URL = "https://groove.example";
    assert.equal(checkoutOrigin("https://attacker.example"), "https://groove.example");
    process.env.APP_URL = "https://groove.example/path";
    assert.throws(() => checkoutOrigin("http://localhost"));
    assert.equal(maskEmail("comprador@example.com"), "c***@example.com");
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});
