import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listUsers } from "@/lib/admin-users.functions";
import {
  cancelTicket as cancelTicketFn,
  issueCourtesyTickets,
  issueExternalPaidTickets,
  refundOrderManual,
} from "@/lib/tickets-admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Users, Download, Gift, Ban, BadgeDollarSign, Undo2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useRoles } from "@/hooks/use-session";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/events/$id_/attendees")({
  component: Attendees,
});

const STATUS_LABEL: Record<string, string> = {
  valid: "Válido",
  checked_in: "Check-in feito",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

function Attendees() {
  const { id } = Route.useParams();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { isAdmin } = useRoles();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["event-attendees", id],
    queryFn: async () => {
      const [{ data: event }, { data: tickets }, { data: batches }] = await Promise.all([
        supabase.from("events").select("id,title,slug").eq("id", id).maybeSingle(),
        supabase
          .from("tickets")
          .select("id,holder_name,holder_email,status,created_at,checked_in_at,batch_id,order_id")
          .eq("event_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("ticket_batches")
          .select("id,name,quantity,sold,reserved")
          .eq("event_id", id)
          .order("sort_order"),
      ]);
      const orderIds = [...new Set((tickets ?? []).map((t) => t.order_id))];
      const { data: orders } = orderIds.length
        ? await supabase.from("orders").select("id,is_courtesy,total_cents").in("id", orderIds)
        : { data: [] as { id: string; is_courtesy: boolean; total_cents: number }[] };
      return {
        event,
        batches: batches ?? [],
        rows: (tickets ?? []).map((t) => ({
          ...t,
          batch_name: (batches ?? []).find((b) => b.id === t.batch_id)?.name ?? "—",
          courtesy: Boolean((orders ?? []).find((o) => o.id === t.order_id)?.is_courtesy),
        })),
      };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["event-attendees", id] });
    qc.invalidateQueries({ queryKey: ["admin-event", id] });
    qc.invalidateQueries({ queryKey: ["my-tickets"] });
  };

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const term = q.trim().toLowerCase();
    return all.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!term) return true;
      return (
        (r.holder_name ?? "").toLowerCase().includes(term) ||
        (r.holder_email ?? "").toLowerCase().includes(term) ||
        r.batch_name.toLowerCase().includes(term)
      );
    });
  }, [data, q, statusFilter]);

  const counts = useMemo(() => {
    const all = data?.rows ?? [];
    return {
      total: all.length,
      valid: all.filter((r) => r.status === "valid").length,
      checked: all.filter((r) => r.status === "checked_in").length,
      cancelled: all.filter((r) => r.status === "cancelled").length,
      courtesy: all.filter((r) => r.courtesy).length,
    };
  }, [data]);

  const cancelTicket = async (ticketId: string) => {
    if (!confirm("Cancelar este ingresso? Ele deixará de valer para entrada.")) return;
    let res: { ok?: boolean; reason?: string };
    try {
      res = await cancelTicketFn({ data: { ticketId } });
    } catch (error) {
      console.error("[attendees] cancel ticket failed", error);
      return toast.error("Não foi possível cancelar o ingresso.");
    }
    const reason = res.reason;
    if (reason === "already_checked_in") return toast.error("Este ingresso já fez check-in.");
    toast.success("Ingresso cancelado");
    refresh();
  };

  const refundOrder = async (orderId: string) => {
    if (
      !confirm(
        "Registrar devolução deste pedido? Faça a transferência manualmente pelo banco. Todos os ingressos do pedido serão invalidados e o valor sairá do faturamento.",
      )
    )
      return;
    try {
      const res = await refundOrderManual({ data: { orderId } });
      if (!res.ok) {
        const m: Record<string, string> = {
          not_paid: "Só pedidos pagos podem ser devolvidos.",
          already_checked_in: "Este pedido tem ingresso com check-in feito.",
          forbidden: "Somente administradores podem fazer isso.",
        };
        return toast.error(m[res.reason ?? ""] ?? "Não foi possível registrar a devolução.");
      }
      toast.success(`Devolução registrada (${res.tickets_cancelled ?? 0} ingresso(s))`);
      refresh();
    } catch (error) {
      console.error("[attendees] refund failed", error);
      toast.error("Não foi possível registrar a devolução.");
    }
  };

  const exportCsv = () => {
    const header = "Nome,E-mail,Tipo de ingresso,Data da compra,Status,Cortesia\n";
    const body = rows
      .map((r) =>
        [
          r.holder_name ?? "",
          r.holder_email ?? "",
          r.batch_name,
          formatDateTime(r.created_at),
          STATUS_LABEL[r.status] ?? r.status,
          r.courtesy ? "Sim" : "Não",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `participantes-${data?.event?.slug ?? id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/events/$id"
          params={{ id }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao evento
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-3xl flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Ingressos e participantes
            </h2>
            <p className="text-sm text-muted-foreground">
              {data?.event?.title} · {counts.total} emitidos · {counts.valid} válidos ·{" "}
              {counts.checked} com check-in · {counts.cancelled} cancelados · {counts.courtesy}{" "}
              cortesias
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Buscar nome, e-mail ou lote"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-56"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="valid">Válidos</SelectItem>
                <SelectItem value="checked_in">Com check-in</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
                <SelectItem value="refunded">Devolvidos</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        </div>
      </div>

      {isAdmin && (
        <>
          <IssueSection
            mode="courtesy"
            eventId={id}
            batches={data?.batches ?? []}
            onDone={refresh}
          />
          <IssueSection
            mode="external"
            eventId={id}
            batches={data?.batches ?? []}
            onDone={refresh}
          />
        </>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center text-muted-foreground">
          Nenhum ingresso encontrado com esses filtros.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Tipo de ingresso</th>
                <th className="px-4 py-3">Emissão</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-3">{r.holder_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.holder_email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      {r.batch_name}
                      {r.courtesy && (
                        <Badge variant="outline" className="border-flame/50 text-flame">
                          Cortesia
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        r.status === "checked_in"
                          ? "default"
                          : r.status === "cancelled"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {isAdmin && r.status === "valid" && !r.courtesy && (
                      <Button variant="ghost" size="sm" onClick={() => refundOrder(r.order_id)}>
                        <Undo2 className="h-4 w-4" /> Devolver
                      </Button>
                    )}
                    {r.status === "valid" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelTicket(r.id)}
                        className="text-destructive"
                      >
                        <Ban className="h-4 w-4" /> Cancelar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ISSUE_COPY = {
  courtesy: {
    title: "Cortesias",
    description:
      "Envie ingressos gratuitos direto para contas já cadastradas. Eles aparecem em “Meus ingressos” com QR Code.",
    action: "Emitir cortesia",
    accountLabel: "Conta que recebe a cortesia",
    success: "Cortesia enviada para",
    error: "Não foi possível emitir a cortesia.",
  },
  external: {
    title: "Venda paga por fora",
    description:
      "Registre um ingresso pago fora da plataforma (dinheiro, Pix direto etc.) para uma conta verificada. O valor do ingresso, sem taxa de serviço, entra no faturamento do evento e no geral.",
    action: "Emitir ingresso pago",
    accountLabel: "Conta que recebe o ingresso",
    success: "Ingresso pago emitido para",
    error: "Não foi possível emitir o ingresso.",
  },
} as const;

function IssueSection({
  mode,
  eventId,
  batches,
  onDone,
}: {
  mode: "courtesy" | "external";
  eventId: string;
  batches: { id: string; name: string; quantity: number; sold: number; reserved: number }[];
  onDone: () => void;
}) {
  const copy = ISSUE_COPY[mode];
  const fetchUsers = useServerFn(listUsers);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    enabled: open,
  });

  const filteredUsers = useMemo(() => {
    const all = users ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all.slice(0, 30);
    return all
      .filter(
        (u) =>
          u.email.toLowerCase().includes(term) || (u.full_name ?? "").toLowerCase().includes(term),
      )
      .slice(0, 30);
  }, [users, search]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!userId) return toast.error("Escolha a conta que vai receber o ingresso.");
    if (!batchId) return toast.error("Escolha o tipo de ingresso.");
    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty < 1) return toast.error("Informe uma quantidade válida.");
    setSaving(true);
    let res: { email?: string };
    try {
      res =
        mode === "courtesy"
          ? await issueCourtesyTickets({ data: { eventId, userId, batchId, quantity: qty } })
          : await issueExternalPaidTickets({ data: { eventId, userId, batchId, quantity: qty } });
    } catch (error) {
      setSaving(false);
      console.error("[issue-tickets] failed", error);
      const message = error instanceof Error ? error.message : "";
      const msg = message.includes("sold_out")
        ? "Não há ingressos disponíveis nesse lote."
        : message.includes("email_not_verified")
          ? "Essa conta ainda não confirmou o e-mail."
          : message.includes("forbidden")
            ? "Somente administradores podem fazer isso."
            : copy.error;
      return toast.error(msg);
    }
    setSaving(false);
    toast.success(`${copy.success} ${res.email ?? "a conta selecionada"}`);
    setUserId("");
    setQuantity("1");
    setOpen(false);
    onDone();
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="display text-2xl flex items-center gap-2">
            {mode === "courtesy" ? (
              <Gift className="h-5 w-5 text-flame" />
            ) : (
              <BadgeDollarSign className="h-5 w-5 text-primary" />
            )}{" "}
            {copy.title}
          </h3>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Fechar" : copy.action}
        </Button>
      </div>

      {open && (
        <form
          onSubmit={submit}
          className="mt-4 grid gap-3 rounded-xl border border-dashed border-border/60 p-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <Label>Buscar conta (nome ou e-mail)</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ex: maria@email.com"
            />
          </div>
          <div className="md:col-span-2">
            <Label>{copy.accountLabel}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder={users ? "Selecione a conta" : "Carregando contas..."} />
              </SelectTrigger>
              <SelectContent>
                {filteredUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {(u.full_name ?? u.email) + " · " + u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo de ingresso</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o lote" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} · {b.quantity - b.sold - b.reserved} disponíveis
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Emitindo..." : copy.action}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
