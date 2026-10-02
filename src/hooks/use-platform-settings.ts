import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Taxa de serviço (comissão) aplicada sobre o preço base do produtor. */
export function useCommissionRate() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("commission_rate")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.commission_rate ?? 0);
    },
    staleTime: 60_000,
  });
  return { rate: data ?? 0, isLoading };
}

/** Taxa de serviço, em centavos, para um preço base. */
export function feeCents(baseCents: number, rate: number): number {
  return Math.round((baseCents * rate) / 100);
}

/** Preço final exibido ao participante (base + taxa). */
export function finalCents(baseCents: number, rate: number): number {
  return baseCents + feeCents(baseCents, rate);
}

export type WhatsappSettings = {
  enabled: boolean;
  number: string | null;
  message: string | null;
};

/** Somente dígitos, com DDI do Brasil quando o número vem sem ele. */
export function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function whatsappLink(number: string | null, message?: string | null): string | null {
  const digits = number ? normalizeWhatsapp(number) : "";
  if (digits.length < 12) return null;
  const text = message?.trim() ? `?text=${encodeURIComponent(message.trim())}` : "";
  return `https://wa.me/${digits}${text}`;
}

/** Contato de WhatsApp configurado pelo administrador. */
export function useWhatsappSettings() {
  return useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async (): Promise<WhatsappSettings> => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("whatsapp_enabled, whatsapp_number, whatsapp_message")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return {
        enabled: Boolean(data?.whatsapp_enabled),
        number: data?.whatsapp_number ?? null,
        message: data?.whatsapp_message ?? null,
      };
    },
    staleTime: 60_000,
  });
}
