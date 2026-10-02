import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GatewayCheck = {
  ok: boolean;
  provider: string;
  environment: string;
  credentialConfigured: boolean;
  message: string;
  checkedAt: string;
};

/**
 * Testa a conexão com o gateway sem nunca devolver credenciais ao navegador.
 * Só administradores podem executar.
 */
export const testGatewayConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: string; environment: string }) => {
    const provider = input?.provider === "mercadopago" ? "mercadopago" : "stripe";
    const environment = input?.environment === "live" ? "live" : "sandbox";
    return { provider, environment };
  })
  .handler(async ({ data, context }): Promise<GatewayCheck> => {
    const { data: adminRole } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) throw new Error("Você não possui permissão para realizar esta operação.");

    const checkedAt = new Date().toISOString();
    const base = { provider: data.provider, environment: data.environment, checkedAt };

    if (data.provider === "stripe") {
      const key = process.env["STRIPE_SECRET_KEY"];
      if (!key) {
        return {
          ...base,
          ok: false,
          credentialConfigured: false,
          message:
            "A configuração do gateway está incompleta: credencial do Stripe ausente no backend.",
        };
      }
      try {
        const res = await fetch("https://api.stripe.com/v1/balance", {
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${key}` },
        });
        return {
          ...base,
          ok: res.ok,
          credentialConfigured: true,
          message: res.ok
            ? "Conexão com o Stripe validada com sucesso."
            : `O Stripe recusou a credencial (HTTP ${res.status}).`,
        };
      } catch {
        return {
          ...base,
          ok: false,
          credentialConfigured: true,
          message: "Falha de rede ao contatar o Stripe.",
        };
      }
    }

    const token = process.env["MERCADOPAGO_ACCESS_TOKEN"];
    if (!token) {
      return {
        ...base,
        ok: false,
        credentialConfigured: false,
        message:
          "A configuração do gateway está incompleta: credencial do Mercado Pago ausente no backend.",
      };
    }
    try {
      const res = await fetch("https://api.mercadopago.com/users/me", {
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}` },
      });
      return {
        ...base,
        ok: res.ok,
        credentialConfigured: true,
        message: res.ok
          ? "Conexão com o Mercado Pago validada com sucesso."
          : `O Mercado Pago recusou a credencial (HTTP ${res.status}).`,
      };
    } catch {
      return {
        ...base,
        ok: false,
        credentialConfigured: true,
        message: "Falha de rede ao contatar o Mercado Pago.",
      };
    }
  });
