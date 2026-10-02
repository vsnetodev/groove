// Server-only Mercado Pago helpers (plain REST, Worker friendly).
const MP_API = "https://api.mercadopago.com";

export function getMercadoPagoToken(): string {
  const token = process.env["MERCADOPAGO_ACCESS_TOKEN"];
  if (!token) throw new Error("mercadopago_not_configured");
  return token;
}

export async function mpRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getMercadoPagoToken()}`,
    "Content-Type": "application/json",
  };
  if (options.idempotencyKey) headers["X-Idempotency-Key"] = options.idempotencyKey;

  const res = await fetch(`${MP_API}${path}`, {
    method,
    signal: AbortSignal.timeout(15000),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const json = (await res.json()) as T & { message?: string; error?: string };
  if (!res.ok) {
    console.error("[mercadopago] request failed", path, res.status, json?.message ?? json?.error);
    throw new Error(json?.message ?? `mercadopago_error_${res.status}`);
  }
  return json;
}

export type MpPreference = {
  id: string;
  init_point: string | null;
  sandbox_init_point: string | null;
};

export type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  currency_id?: string;
  external_reference?: string | null;
  metadata?: Record<string, unknown> | null;
  order?: { id?: string | number; type?: string } | null;
};

export type MpMerchantOrder = {
  id: number | string;
  preference_id?: string;
  external_reference?: string | null;
  payments?: { id: number | string; status: string; transaction_amount: number }[];
};

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifica a assinatura do webhook (x-signature) quando MERCADOPAGO_WEBHOOK_SECRET
 * estiver configurado. Sem segredo, a autenticidade é garantida relendo o pagamento na API.
 */
export async function verifyMercadoPagoSignature(
  secret: string,
  signatureHeader: string | null,
  requestId: string | null,
  dataId: string | null,
  toleranceSeconds = 600,
): Promise<boolean> {
  if (!signatureHeader || !dataId) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((chunk) => {
      const [k, ...rest] = chunk.trim().split("=");
      return [(k ?? "").trim(), rest.join("=").trim()];
    }),
  ) as Record<string, string>;

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;
  const age = Math.abs(
    Math.floor(Date.now() / 1000) - Math.floor(Number(ts) / (String(ts).length > 12 ? 1000 : 1)),
  );
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const manifest = `id:${dataId.toLowerCase()};${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqualHex(v1, expected);
}
