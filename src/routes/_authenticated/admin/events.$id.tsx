import type { Tables } from "@/integrations/supabase/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cancelEvent as cancelEventFn } from "@/lib/tickets-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Plus,
  Eye,
  Send,
  Ticket as TicketIcon,
  Tag,
  Users,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { useRoles } from "@/hooks/use-session";
import { useNavigate } from "@tanstack/react-router";
import { formatBRL } from "@/lib/format";
import { useCommissionRate, feeCents } from "@/hooks/use-platform-settings";
import { useState } from "react";
import { toast } from "sonner";
import { EventForm } from "@/components/event-form";

export const Route = createFileRoute("/_authenticated/admin/events/$id")({
  component: EventManage,
});

function EventManage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { isAdmin } = useRoles();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-event", id],
    queryFn: async () => {
      const [eventRes, batchesRes, couponsRes, ordersRes] = await Promise.all([
        supabase.from("events").select("*").eq("id", id).maybeSingle(),
        supabase.from("ticket_batches").select("*").eq("event_id", id).order("sort_order"),
        supabase.from("coupons").select("*").eq("event_id", id),
        supabase
          .from("orders")
          .select("total_cents,status")
          .eq("event_id", id)
          .eq("status", "paid"),
      ]);
      if (eventRes.error) throw eventRes.error;
      const event = eventRes.data;
      const batches = batchesRes.data;
      const coupons = couponsRes.data;
      const orders = ordersRes.data;
      const revenue = (orders ?? []).reduce((s, o) => s + o.total_cents, 0);
      return {
        event,
        batches: batches ?? [],
        coupons: coupons ?? [],
        revenue,
        ordersCount: orders?.length ?? 0,
      };
    },
    retry: 1,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-event", id] });
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["event"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-1/3 animate-pulse rounded-lg bg-surface" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <StateCard
        title="Não foi possível carregar o evento"
        message={
          (error as { code?: string } | null)?.code === "PGRST301"
            ? "Sua sessão expirou. Entre novamente."
            : "Verifique sua conexão e tente novamente."
        }
        onRetry={() => refetch()}
      />
    );
  }
  const { event, batches, coupons, revenue, ordersCount } = data;
  if (!event) {
    return (
      <StateCard
        title="Evento não encontrado"
        message="Ele pode ter sido removido ou você não tem acesso a ele."
      />
    );
  }

  const cancelEvent = async () => {
    if (
      !confirm(
        `Cancelar "${event.title}"?\n\nO evento sai do ar, as vendas são encerradas e todos os ingressos válidos são invalidados. Os reembolsos precisam ser feitos pelo painel do meio de pagamento.`,
      )
    )
      return;
    let res: { tickets_cancelled?: number };
    try {
      res = await cancelEventFn({ data: { eventId: id } });
    } catch (error) {
      console.error("[admin-event] cancel failed", error);
      return toast.error("Não foi possível cancelar o evento.");
    }
    const n = res.tickets_cancelled ?? 0;
    toast.success(
      `Evento cancelado. ${n} ingresso${n === 1 ? "" : "s"} invalidado${n === 1 ? "" : "s"}.`,
    );
    refresh();
  };

  const setStatus = async (status: "draft" | "published" | "ended") => {
    const { error } = await supabase.from("events").update({ status }).eq("id", id);
    if (error) {
      console.error("[admin-event] status update failed", error);
      return toast.error("Você não possui permissão ou houve uma falha ao atualizar a situação.");
    }
    toast.success(`Evento ${status === "published" ? "publicado" : "atualizado"}`);
    refresh();
  };

  const deleteEvent = async () => {
    if (deleting) return;
    if (!confirm(`Excluir definitivamente "${event.title}"? Esta ação não pode ser desfeita.`))
      return;
    setDeleting(true);
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id);
    if ((count ?? 0) > 0) {
      setDeleting(false);
      return toast.error(
        "Este evento já possui pedidos e não pode ser excluído. Cancele o evento em vez disso.",
      );
    }
    await supabase.from("coupons").delete().eq("event_id", id);
    await supabase.from("ticket_batches").delete().eq("event_id", id);
    const { error } = await supabase.from("events").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      console.error("[admin-event] delete failed", error);
      return toast.error("Não foi possível excluir o evento.");
    }
    toast.success("Evento excluído");
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    navigate({ to: "/admin" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="display text-3xl">{event.title}</h2>
            <Badge variant="outline">{event.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {ordersCount} pedidos · {formatBRL(revenue)} arrecadados
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/events/$slug" params={{ slug: event.slug }} target="_blank">
              <Eye className="h-4 w-4" /> Ver página
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            <Pencil className="h-4 w-4" /> {editing ? "Fechar edição" : "Editar"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/events/$id/attendees" params={{ id }}>
              <Users className="h-4 w-4" /> Participantes
            </Link>
          </Button>
          {event.status === "draft" ? (
            <Button
              size="sm"
              onClick={() => setStatus("published")}
              disabled={batches.length === 0}
              className="bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)]"
            >
              <Send className="h-4 w-4" /> Publicar
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setStatus("draft")}>
                Despublicar
              </Button>
              {event.status !== "cancelled" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelEvent}
                  className="border-flame/50 text-flame hover:bg-flame/10"
                >
                  Cancelar evento
                </Button>
              )}
            </>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={deleteEvent}
              disabled={deleting}
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" /> {deleting ? "Excluindo..." : "Excluir evento"}
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <EventForm
          event={event}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}

      <BatchesSection eventId={id} batches={batches} onChange={refresh} />
      <CouponsSection eventId={id} coupons={coupons} onChange={refresh} />
    </div>
  );
}

function StateCard({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
      <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-flame" />
      <h3 className="display text-2xl">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

function BatchesSection({
  eventId,
  batches,
  onChange,
}: {
  eventId: string;
  batches: Tables<"ticket_batches">[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { rate } = useCommissionRate();
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    quantity: "",
    sales_end: "",
  });
  const [saving, setSaving] = useState(false);

  const addBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const price = parseFloat(form.price);
    const quantity = parseInt(form.quantity, 10);
    if (!Number.isFinite(price) || price < 0)
      return toast.error("Informe um preço válido (zero ou maior).");
    if (!Number.isInteger(quantity) || quantity < 1)
      return toast.error("Informe uma quantidade válida.");
    setSaving(true);
    const { error } = await supabase.from("ticket_batches").insert({
      event_id: eventId,
      name: form.name,
      description: form.description || null,
      price_cents: Math.round(price * 100),
      quantity,
      sales_end: form.sales_end ? new Date(form.sales_end).toISOString() : null,
      sort_order: batches.length,
      active: true,
    });
    setSaving(false);
    if (error) {
      console.error("[batches] insert failed", error);
      return toast.error(
        "Não foi possível adicionar o lote. Verifique suas permissões e tente novamente.",
      );
    }
    toast.success("Lote adicionado");
    setForm({ name: "", description: "", price: "", quantity: "", sales_end: "" });
    setOpen(false);
    onChange();
  };

  const removeBatch = async (bid: string) => {
    if (!confirm("Remover este lote?")) return;
    const { error } = await supabase.from("ticket_batches").delete().eq("id", bid);
    if (error) return toast.error(error.message);
    toast.success("Lote removido");
    onChange();
  };

  const toggleActive = async (b: Tables<"ticket_batches">) => {
    await supabase.from("ticket_batches").update({ active: !b.active }).eq("id", b.id);
    onChange();
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="display text-2xl flex items-center gap-2">
          <TicketIcon className="h-5 w-5 text-primary" /> Lotes
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> Novo lote
        </Button>
      </div>

      {open && (
        <form
          onSubmit={addBatch}
          className="mb-4 grid gap-3 rounded-xl border border-dashed border-border/60 p-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <Label>Nome (ex: 1º lote pista)</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label>Preço (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Preço base que você recebe. A plataforma acrescenta {rate}% de taxa de serviço para o
              participante.
            </p>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
          </div>
          <div className="md:col-span-2">
            <Label>Encerrar vendas em (opcional)</Label>
            <Input
              type="datetime-local"
              value={form.sales_end}
              onChange={(e) => setForm({ ...form, sales_end: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Adicionar lote
            </Button>
          </div>
        </form>
      )}

      {batches.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Adicione lotes antes de publicar o evento.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {batches.map((b) => {
            const soldOut = b.sold >= b.quantity;
            return (
              <li key={b.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{b.name}</p>
                    {!b.active && <Badge variant="outline">Inativo</Badge>}
                    {soldOut && <Badge variant="destructive">Esgotado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Base {formatBRL(b.price_cents)} + taxa{" "}
                    {formatBRL(feeCents(b.price_cents, rate))} ({rate}%) ={" "}
                    <span className="text-foreground">
                      {formatBRL(b.price_cents + feeCents(b.price_cents, rate))}
                    </span>{" "}
                    · Vendidos {b.sold}/{b.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(b)}>
                    {b.active ? "Pausar" : "Ativar"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeBatch(b.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CouponsSection({
  eventId,
  coupons,
  onChange,
}: {
  eventId: string;
  coupons: Tables<"coupons">[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discount_type: "percent" as "percent" | "fixed",
    discount_value: "",
    max_uses: "",
  });
  const [saving, setSaving] = useState(false);

  const addCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const value =
      form.discount_type === "fixed"
        ? Math.round(parseFloat(form.discount_value) * 100)
        : parseInt(form.discount_value, 10);
    const { error } = await supabase.from("coupons").insert({
      event_id: eventId,
      code: form.code.toUpperCase(),
      discount_type: form.discount_type,
      discount_value: value,
      max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cupom criado");
    setForm({ code: "", discount_type: "percent", discount_value: "", max_uses: "" });
    setOpen(false);
    onChange();
  };

  const remove = async (cid: string) => {
    if (!confirm("Remover cupom?")) return;
    await supabase.from("coupons").delete().eq("id", cid);
    onChange();
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="display text-2xl flex items-center gap-2">
          <Tag className="h-5 w-5 text-flame" /> Cupons
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> Novo cupom
        </Button>
      </div>

      {open && (
        <form
          onSubmit={addCoupon}
          className="mb-4 grid gap-3 rounded-xl border border-dashed border-border/60 p-4 md:grid-cols-2"
        >
          <div>
            <Label>Código</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              required
              className="uppercase font-mono"
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select
              value={form.discount_type}
              onValueChange={(v) =>
                setForm({ ...form, discount_type: v === "fixed" ? "fixed" : "percent" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Porcentagem (%)</SelectItem>
                <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Desconto {form.discount_type === "percent" ? "(%)" : "(R$)"}</Label>
            <Input
              type="number"
              step={form.discount_type === "percent" ? "1" : "0.01"}
              value={form.discount_value}
              onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Usos máximos (opcional)</Label>
            <Input
              type="number"
              min="1"
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Criar cupom
            </Button>
          </div>
        </form>
      )}

      {coupons.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhum cupom.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {coupons.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-mono font-semibold">{c.code}</p>
                <p className="text-xs text-muted-foreground">
                  {c.discount_type === "percent"
                    ? `${c.discount_value}% off`
                    : `${formatBRL(c.discount_value)} off`}
                  {" · "}
                  {c.uses}
                  {c.max_uses ? `/${c.max_uses}` : ""} usos
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(c.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
