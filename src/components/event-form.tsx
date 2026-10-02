import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CoverUpload } from "@/components/cover-upload";
import { slugify } from "@/lib/format";
import { removeCover, uploadCover } from "@/lib/event-covers";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export type EventRow = Tables<"events">;

const CATEGORIES = [
  "Festa",
  "Show",
  "Festival",
  "Teatro",
  "Workshop",
  "Esporte",
  "Conferência",
  "Outro",
];
const AGE_RATINGS = ["Livre", "10 anos", "12 anos", "14 anos", "16 anos", "18 anos"];

type FormState = {
  title: string;
  tagline: string;
  description: string;
  category: string;
  starts_at: string;
  ends_at: string;
  sales_start: string;
  sales_end: string;
  venue: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  format: "presencial" | "online" | "hibrido";
  capacity: string;
  age_rating: string;
  organizer_name: string;
  organizer_contact: string;
  status: "draft" | "published" | "ended" | "cancelled";
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialState(event?: EventRow | null): FormState {
  return {
    title: event?.title ?? "",
    tagline: event?.tagline ?? "",
    description: event?.description ?? "",
    category: event?.category ?? "",
    starts_at: toLocalInput(event?.starts_at ?? null),
    ends_at: toLocalInput(event?.ends_at ?? null),
    sales_start: toLocalInput(event?.sales_start ?? null),
    sales_end: toLocalInput(event?.sales_end ?? null),
    venue: event?.venue ?? "",
    address: event?.address ?? "",
    city: event?.city ?? "",
    state: event?.state ?? "",
    postal_code: event?.postal_code ?? "",
    format: (event?.format as FormState["format"]) ?? "presencial",
    capacity: event?.capacity ? String(event.capacity) : "",
    age_rating: event?.age_rating ?? "",
    organizer_name: event?.organizer_name ?? "",
    organizer_contact: event?.organizer_contact ?? "",
    status: (event?.status as FormState["status"]) ?? "draft",
  };
}

function validate(f: FormState): string[] {
  const errors: string[] = [];
  if (!f.title.trim()) errors.push("Informe o nome do evento.");
  if (f.title.length > 140) errors.push("O nome do evento é muito longo.");
  if (!f.starts_at) errors.push("Informe a data e o horário de início.");
  const starts = f.starts_at ? new Date(f.starts_at) : null;
  const ends = f.ends_at ? new Date(f.ends_at) : null;
  if (starts && Number.isNaN(starts.getTime())) errors.push("Data de início inválida.");
  if (ends && starts && ends < starts)
    errors.push("A data de encerramento não pode ser anterior à de início.");
  const sStart = f.sales_start ? new Date(f.sales_start) : null;
  const sEnd = f.sales_end ? new Date(f.sales_end) : null;
  if (sStart && sEnd && sEnd < sStart)
    errors.push("O encerramento das vendas não pode ser anterior ao início das vendas.");
  if (sEnd && starts && sEnd > starts)
    errors.push("As vendas não podem encerrar depois do início do evento.");
  if (f.capacity && (!/^\d+$/.test(f.capacity) || Number(f.capacity) <= 0)) {
    errors.push("A capacidade total deve ser um número inteiro positivo.");
  }
  if (f.format !== "online" && !f.venue.trim() && !f.city.trim()) {
    errors.push("Informe ao menos o local ou a cidade do evento.");
  }
  if (f.status === "published") {
    if (!f.description.trim()) errors.push("Descreva o evento antes de publicar.");
    if (!f.category) errors.push("Selecione uma categoria antes de publicar.");
  }
  return errors;
}

export function EventForm({ event, onSaved }: { event?: EventRow | null; onSaved?: () => void }) {
  const isEdit = !!event;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(() => initialState(event));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(event?.cover_path ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const invalidate = (id?: string, slug?: string) => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    if (id) qc.invalidateQueries({ queryKey: ["admin-event", id] });
    if (slug) qc.invalidateQueries({ queryKey: ["event", slug] });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const errors = validate(form);
    if (errors.length) {
      toast.error(errors[0], {
        description: errors.length > 1 ? `+${errors.length - 1} pendência(s)` : undefined,
      });
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sua sessão expirou. Entre novamente para continuar.");

      const payload = {
        title: form.title.trim(),
        tagline: form.tagline.trim() || null,
        description: form.description.trim() || null,
        category: form.category || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        sales_start: form.sales_start ? new Date(form.sales_start).toISOString() : null,
        sales_end: form.sales_end ? new Date(form.sales_end).toISOString() : null,
        venue: form.venue.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        format: form.format,
        capacity: form.capacity ? Number(form.capacity) : null,
        age_rating: form.age_rating || null,
        organizer_name: form.organizer_name.trim() || null,
        organizer_contact: form.organizer_contact.trim() || null,
        status: form.status,
        updated_by: auth.user.id,
      };

      let saved: EventRow;
      if (isEdit && event) {
        const { data, error } = await supabase
          .from("events")
          .update(payload)
          .eq("id", event.id)
          .select()
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const slug = `${slugify(form.title)}-${Math.random().toString(36).slice(2, 6)}`;
        const { data, error } = await supabase
          .from("events")
          .insert({ ...payload, slug, created_by: auth.user.id })
          .select()
          .single();
        if (error) throw error;
        saved = data;
      }

      // Capa: envia depois de existir o evento (a permissão do Storage usa o id do evento)
      if (coverFile) {
        setUploading(true);
        try {
          const previous = saved.cover_path;
          const path = await uploadCover(saved.id, coverFile);
          const { error } = await supabase
            .from("events")
            .update({ cover_path: path, cover_url: null })
            .eq("id", saved.id);
          if (error) throw error;
          await removeCover(previous);
          setCoverPath(path);
          setCoverFile(null);
        } catch (err) {
          console.error("[event-form] cover upload failed", err);
          toast.error("Evento salvo, mas a imagem de capa não pôde ser enviada.");
        } finally {
          setUploading(false);
        }
      }

      invalidate(saved.id, saved.slug);
      toast.success(isEdit ? "Evento atualizado." : "Evento criado! Agora cadastre os lotes.");
      onSaved?.();
      if (!isEdit) navigate({ to: "/admin/events/$id", params: { id: saved.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[event-form] save failed", err);
      toast.error(
        message.includes("row-level security")
          ? "Você não possui permissão para realizar esta operação."
          : `Não foi possível salvar o evento: ${message}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const dropCover = async () => {
    if (!coverPath || !event) return;
    const { error } = await supabase.from("events").update({ cover_path: null }).eq("id", event.id);
    if (error) return toast.error("Não foi possível remover a imagem.");
    await removeCover(coverPath);
    setCoverPath(null);
    invalidate(event.id, event.slug);
    toast.success("Imagem de capa removida.");
  };

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border border-border/60 bg-card p-6">
      <h2 className="display text-3xl">{isEdit ? "Editar evento" : "Novo evento"}</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome do evento" required className="md:col-span-2">
          <Input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={140}
            required
          />
        </Field>
        <Field label="Descrição resumida" className="md:col-span-2">
          <Input
            value={form.tagline}
            onChange={(e) => set("tagline", e.target.value)}
            maxLength={180}
            placeholder="Uma linha curta e vibrante"
          />
        </Field>
        <Field label="Descrição completa" className="md:col-span-2">
          <Textarea
            rows={5}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={5000}
          />
        </Field>

        <Field label="Categoria">
          <Select value={form.category} onValueChange={(v) => set("category", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Classificação indicativa">
          <Select value={form.age_rating} onValueChange={(v) => set("age_rating", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {AGE_RATINGS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Início do evento" required>
          <Input
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => set("starts_at", e.target.value)}
            required
          />
        </Field>
        <Field label="Encerramento do evento">
          <Input
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => set("ends_at", e.target.value)}
          />
        </Field>
        <Field label="Início das vendas">
          <Input
            type="datetime-local"
            value={form.sales_start}
            onChange={(e) => set("sales_start", e.target.value)}
          />
        </Field>
        <Field label="Encerramento das vendas">
          <Input
            type="datetime-local"
            value={form.sales_end}
            onChange={(e) => set("sales_end", e.target.value)}
          />
        </Field>

        <Field label="Formato">
          <Select
            value={form.format}
            onValueChange={(v) => set("format", v as FormState["format"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="presencial">Presencial</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="hibrido">Híbrido</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Capacidade total">
          <Input
            type="number"
            min="1"
            value={form.capacity}
            onChange={(e) => set("capacity", e.target.value)}
          />
        </Field>

        <Field label="Local">
          <Input
            value={form.venue}
            onChange={(e) => set("venue", e.target.value)}
            placeholder="Clube Groove"
          />
        </Field>
        <Field label="Endereço">
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Cidade">
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Estado">
            <Input
              value={form.state}
              onChange={(e) => set("state", e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="SP"
            />
          </Field>
          <Field label="CEP">
            <Input
              value={form.postal_code}
              onChange={(e) => set("postal_code", e.target.value)}
              maxLength={9}
              placeholder="00000-000"
            />
          </Field>
        </div>

        <Field label="Nome do organizador">
          <Input
            value={form.organizer_name}
            onChange={(e) => set("organizer_name", e.target.value)}
          />
        </Field>
        <Field label="Contato do organizador">
          <Input
            value={form.organizer_contact}
            onChange={(e) => set("organizer_contact", e.target.value)}
            placeholder="e-mail ou telefone"
          />
        </Field>

        <Field label="Situação">
          <Select
            value={form.status}
            onValueChange={(v) => set("status", v as FormState["status"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="published">Publicado</SelectItem>
              <SelectItem value="ended">Encerrado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <CoverUpload
        existingPath={coverPath}
        existingUrl={event?.cover_url}
        file={coverFile}
        onFileChange={setCoverFile}
        onRemoveExisting={dropCover}
        uploading={uploading}
        progress={uploading ? 70 : 0}
      />

      <Button
        type="submit"
        disabled={saving || uploading}
        className="w-full bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)] hover:opacity-90"
      >
        {saving || uploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
          </>
        ) : isEdit ? (
          "Salvar alterações"
        ) : (
          "Criar evento"
        )}
      </Button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">
        {label} {required && <span className="text-flame">*</span>}
      </Label>
      {children}
    </div>
  );
}
