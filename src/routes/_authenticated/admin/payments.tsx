import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CreditCard, Loader2, PlugZap, ShieldCheck } from "lucide-react";
import { useRoles } from "@/hooks/use-session";
import { testGatewayConnection } from "@/lib/payments.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({
    meta: [
      { title: "Configurações de pagamento — Clube Groove" },
      {
        name: "description",
        content: "Gerencie o gateway de pagamento, ambiente, moeda e taxas da plataforma.",
      },
    ],
  }),
  component: PaymentSettings,
});

type Form = {
  provider: "stripe" | "mercadopago";
  enabled: boolean;
  environment: "sandbox" | "live";
  currency: string;
  platform_fee_percent: string;
  fixed_fee_cents: string;
  payout_delay_days: string;
};

function PaymentSettings() {
  const qc = useQueryClient();
  const { isAdmin, checked } = useRoles();
  const runTest = useServerFn(testGatewayConnection);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      provider: data.provider as Form["provider"],
      enabled: data.enabled,
      environment: data.environment as Form["environment"],
      currency: data.currency,
      platform_fee_percent: String(data.platform_fee_percent),
      fixed_fee_cents: String(data.fixed_fee_cents),
      payout_delay_days: String(data.payout_delay_days),
    });
  }, [data]);

  if (checked && !isAdmin) {
    return (
      <p className="text-muted-foreground">
        Você não possui permissão para acessar as configurações de pagamento.
      </p>
    );
  }
  if (isLoading || !form) {
    return <div className="h-64 max-w-2xl animate-pulse rounded-2xl bg-surface" />;
  }
  if (isError) {
    return (
      <div className="max-w-2xl rounded-2xl border border-dashed border-border/60 p-10 text-center">
        <p className="text-muted-foreground">
          Não foi possível carregar as configurações de pagamento.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((p) => (p ? { ...p, [key]: value } : p));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const fee = Number(form.platform_fee_percent.replace(",", "."));
    const fixed = Number(form.fixed_fee_cents);
    const payout = Number(form.payout_delay_days);
    if (!Number.isFinite(fee) || fee < 0 || fee > 50)
      return toast.error("A taxa percentual deve estar entre 0 e 50.");
    if (!Number.isInteger(fixed) || fixed < 0)
      return toast.error("A taxa fixa deve ser um valor em centavos, zero ou maior.");
    if (!Number.isInteger(payout) || payout < 0)
      return toast.error("O prazo de repasse deve ser um número de dias válido.");

    setSaving(true);
    const { data: updated, error } = await supabase
      .from("payment_settings")
      .update({
        provider: form.provider,
        enabled: form.enabled,
        environment: form.environment,
        currency: form.currency,
        platform_fee_percent: fee,
        fixed_fee_cents: fixed,
        payout_delay_days: payout,
      })
      .eq("id", 1)
      .select();
    setSaving(false);
    if (error) {
      console.error("[payment-settings] update failed", error);
      return toast.error(`Não foi possível salvar: ${error.message}`);
    }
    if (!updated?.length)
      return toast.error("Você não possui permissão para alterar estas configurações.");
    qc.invalidateQueries({ queryKey: ["payment-settings"] });
    toast.success("Configurações de pagamento salvas.");
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await runTest({
        data: { provider: form.provider, environment: form.environment },
      });
      await supabase
        .from("payment_settings")
        .update({
          last_validated_at: result.checkedAt,
          last_status: result.ok ? "ok" : "error",
          last_error: result.ok ? null : result.message,
        })
        .eq("id", 1);
      qc.invalidateQueries({ queryKey: ["payment-settings"] });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (err) {
      console.error("[payment-settings] test failed", err);
      toast.error("Não foi possível testar a conexão com o gateway.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={save} className="space-y-5 rounded-2xl border border-border/60 bg-card p-6">
        <div>
          <h2 className="display text-3xl flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Configurações de pagamento
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Parâmetros públicos da integração. As credenciais secretas ficam apenas no backend e
            nunca são exibidas aqui.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/60 p-4">
          <div>
            <p className="font-medium">Gateway ativo</p>
            <p className="text-xs text-muted-foreground">
              Quando desativado, o checkout não inicia cobranças.
            </p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block">Provedor</Label>
            <Select
              value={form.provider}
              onValueChange={(v) => set("provider", v as Form["provider"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="mercadopago">Mercado Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Ambiente</Label>
            <Select
              value={form.environment}
              onValueChange={(v) => set("environment", v as Form["environment"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Teste</SelectItem>
                <SelectItem value="live">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Moeda</Label>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">BRL — Real</SelectItem>
                <SelectItem value="USD">USD — Dólar</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Prazo de repasse (dias)</Label>
            <Input
              type="number"
              min="0"
              value={form.payout_delay_days}
              onChange={(e) => set("payout_delay_days", e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Taxa da plataforma (%)</Label>
            <Input
              inputMode="decimal"
              value={form.platform_fee_percent}
              onChange={(e) => set("platform_fee_percent", e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Taxa fixa (centavos)</Label>
            <Input
              type="number"
              min="0"
              value={form.fixed_fee_cents}
              onChange={(e) => set("fixed_fee_cents", e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)]"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
            </>
          ) : (
            "Salvar configurações"
          )}
        </Button>
      </form>

      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <h3 className="display text-2xl flex items-center gap-2">
          <PlugZap className="h-5 w-5 text-flame" /> Estado da integração
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge
            variant="outline"
            className={
              data?.last_status === "ok" ? "border-primary/50 text-primary" : "border-border"
            }
          >
            {data?.last_status === "ok"
              ? "Conectado"
              : data?.last_status === "error"
                ? "Com erro"
                : "Não validado"}
          </Badge>
          <span className="text-muted-foreground">
            {data?.last_validated_at
              ? `Última validação: ${formatDateTime(data.last_validated_at)}`
              : "Nenhuma validação registrada."}
          </span>
        </div>
        {data?.last_error && <p className="text-sm text-destructive">{data.last_error}</p>}
        <Button variant="outline" onClick={test} disabled={testing}>
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testando…
            </>
          ) : (
            "Testar conexão"
          )}
        </Button>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          As chaves secretas ficam armazenadas apenas no ambiente seguro do backend. Nenhuma
          credencial trafega para o navegador.
        </p>
      </section>
    </div>
  );
}
