import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Percent, ShieldCheck, MessageCircle } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { useRoles } from "@/hooks/use-session";
import {
  feeCents,
  normalizeWhatsapp,
  useWhatsappSettings,
  whatsappLink,
} from "@/hooks/use-platform-settings";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: PlatformSettings,
});

function PlatformSettings() {
  const qc = useQueryClient();
  const { isAdmin, checked } = useRoles();
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

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
  });

  useEffect(() => {
    if (data !== undefined) setRate(String(data));
  }, [data]);

  if (checked && !isAdmin) {
    return (
      <p className="text-muted-foreground">
        Apenas administradores podem acessar as configurações da plataforma.
      </p>
    );
  }
  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;

  const parsed = Number(rate.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 50;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return toast.error("Informe um percentual entre 0 e 50.");
    setSaving(true);
    const { data: updated, error } = await supabase
      .from("platform_settings")
      .update({ commission_rate: parsed })
      .eq("id", 1)
      .select("commission_rate");
    setSaving(false);
    if (error) {
      console.error("[platform_settings] update failed", error);
      return toast.error(`Falha ao salvar: ${error.message}`, {
        description:
          [error.code, error.hint, error.details].filter(Boolean).join(" · ") || undefined,
      });
    }
    if (!updated || updated.length === 0) {
      console.error("[platform_settings] update affected 0 rows (RLS/permissão de admin)");
      return toast.error(
        "Nenhuma linha atualizada: sua conta não tem permissão de administrador para alterar a taxa.",
      );
    }
    toast.success("Taxa de comissão atualizada.");
    qc.invalidateQueries({ queryKey: ["platform-settings"] });
  };

  const example = 5000;

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={save} className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div>
          <h2 className="display text-3xl flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" /> Comissão da plataforma
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Aplicada automaticamente sobre o preço base definido pelo produtor, como taxa de serviço
            para o participante.
          </p>
        </div>

        <div>
          <Label htmlFor="rate" className="mb-1.5 block">
            Taxa de comissão (%)
          </Label>
          <Input
            id="rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="font-mono"
          />
          <p className="mt-1 text-xs text-muted-foreground">Entre 0% e 50%.</p>
        </div>

        <div className="rounded-xl border border-dashed border-border/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Simulação</p>
          <Row label="Preço base do produtor" value={formatBRL(example)} />
          <Row
            label={`Taxa de serviço (${valid ? parsed : 0}%)`}
            value={formatBRL(feeCents(example, valid ? parsed : 0))}
          />
          <Row
            label="Participante paga"
            value={formatBRL(example + feeCents(example, valid ? parsed : 0))}
            className="font-bold pt-1"
          />
        </div>

        <Button
          type="submit"
          disabled={saving || !valid}
          className="bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)]"
        >
          {saving ? "Salvando..." : "Salvar taxa"}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Vendas já registradas mantêm a taxa vigente no
          momento da compra.
        </p>
      </form>

      <WhatsappCard />
    </div>
  );
}

function WhatsappCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useWhatsappSettings();
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setNumber(data.number ?? "");
    setMessage(data.message ?? "");
    setEnabled(data.enabled);
  }, [data]);

  const link = whatsappLink(number, message);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enabled && !link) {
      return toast.error("Informe um número válido com DDD, ex.: (11) 99999-9999.");
    }
    setSaving(true);
    const { data: updated, error } = await supabase
      .from("platform_settings")
      .update({
        whatsapp_number: number.trim() ? normalizeWhatsapp(number) : null,
        whatsapp_message: message.trim() || null,
        whatsapp_enabled: enabled,
      })
      .eq("id", 1)
      .select("whatsapp_enabled");
    setSaving(false);
    if (error) return toast.error(`Falha ao salvar: ${error.message}`);
    if (!updated || updated.length === 0) {
      return toast.error("Nenhuma linha atualizada: sua conta não tem permissão de administrador.");
    }
    toast.success("WhatsApp atualizado.");
    qc.invalidateQueries({ queryKey: ["whatsapp-settings"] });
  };

  return (
    <form onSubmit={save} className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
      <div>
        <h2 className="display text-3xl flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-[oklch(0.72_0.18_150)]" /> WhatsApp de atendimento
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte o número que atende os participantes. Um botão flutuante abre a conversa direto no
          WhatsApp.
        </p>
      </div>

      <div>
        <Label htmlFor="wa-number" className="mb-1.5 block">
          Número com DDD
        </Label>
        <Input
          id="wa-number"
          inputMode="tel"
          placeholder="(11) 99999-9999"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="font-mono"
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          O DDI do Brasil (+55) é adicionado automaticamente.
        </p>
      </div>

      <div>
        <Label htmlFor="wa-message" className="mb-1.5 block">
          Mensagem inicial (opcional)
        </Label>
        <Input
          id="wa-message"
          placeholder="Olá! Tenho uma dúvida sobre os ingressos."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-[oklch(0.72_0.18_150)]"
        />
        Exibir o botão de WhatsApp no site
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={saving || isLoading}
          className="bg-[oklch(0.72_0.18_150)] text-background hover:opacity-90"
        >
          {saving ? "Salvando..." : "Salvar WhatsApp"}
        </Button>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline"
          >
            Testar conversa
          </a>
        )}
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
