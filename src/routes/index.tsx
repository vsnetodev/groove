import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Disc3,
  Speaker,
  Calendar,
  MapPin,
  ArrowRight,
  Sparkles,
  Ticket,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";
import hero from "@/assets/hero.jpg";
import { formatDateLong } from "@/lib/format";
import { useCoverUrl } from "@/hooks/use-cover-url";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clube Groove — Ingressos oficiais para as melhores noites" },
      {
        name: "description",
        content:
          "Compre ingressos oficiais do Clube Groove com QR único, cupons ao vivo e check-in instantâneo. Acesse seus ingressos na área Minha conta.",
      },
      { property: "og:title", content: "Clube Groove — Ingressos oficiais" },
      {
        property: "og:description",
        content: "Ingressos oficiais com QR único, cupons ao vivo e check-in instantâneo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function useEvents() {
  return useQuery({
    queryKey: ["events", "published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,slug,title,tagline,venue,city,starts_at,cover_url,cover_path")
        .eq("status", "published")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    retry: 1,
  });
}

const AnimatedDisc = motion.create(Disc3);

function Home() {
  const { data: events, isLoading, isError, refetch } = useEvents();

  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Mobile-only artistic glows */}
        <div className="pointer-events-none absolute -top-20 -left-20 -z-10 h-64 w-64 rounded-full bg-primary/20 blur-[100px] md:hidden" />
        <div className="pointer-events-none absolute top-1/2 -right-20 -z-10 h-64 w-64 rounded-full bg-accent/10 blur-[100px] md:hidden" />

        <div className="absolute inset-0 -z-10">
          <img src={hero} alt="" className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        </div>
        <AnimatedDisc
          aria-hidden
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 0.28, scale: 1, rotate: 360 }}
          transition={{
            opacity: { duration: 1.2 },
            scale: { duration: 1.2 },
            rotate: { duration: 90, repeat: Infinity, ease: "linear" },
          }}
          className="pointer-events-none absolute -right-16 top-4 -z-10 w-[18rem] max-w-[45vw] select-none mix-blend-screen blur-[1px] md:-right-24 md:top-8 md:w-[34rem] md:max-w-[55vw]"
        />
        <Speaker
          aria-hidden
          className="pointer-events-none absolute -left-20 bottom-0 -z-10 hidden w-72 select-none opacity-[0.12] mix-blend-screen lg:block"
        />
        <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-36">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <Badge variant="outline" className="mb-6 border-primary/50 bg-primary/10 text-primary">
              <Sparkles className="mr-1.5 h-3 w-3" /> A tiqueteria oficial das noites
            </Badge>
            <p className="mb-2 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground md:block">
              Bem-vindo ao
            </p>
            <h1 className="display text-6xl leading-[0.9] tracking-tight md:text-8xl">
              <span className="text-gradient-primary">CLUBE</span>
              <br />
              <span className="text-gradient-flame">GROOVE</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Ingresso oficial com QR único, cupons ao vivo e check-in instantâneo. Compra segura,
              entrega no e-mail, dança na pista.
            </p>
            <div className="mt-8 flex flex-col gap-3 md:flex-row md:flex-wrap">
              <Button
                size="lg"
                asChild
                className="w-full bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)] hover:opacity-90 glow-primary md:w-auto"
              >
                <a href="#eventos">
                  Ver eventos <ArrowRight className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="w-full border-accent/50 text-accent hover:bg-accent/10 hover:text-accent md:w-auto"
              >
                <Link to="/my-tickets">Meus ingressos</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="w-full border-primary/50 hover:bg-primary/10 md:w-auto"
              >
                <Link to="/auth" search={{ mode: "signup", type: "produtor" }}>
                  Criar evento · Quero ser produtor
                </Link>
              </Button>
            </div>
            <dl className="mt-14 grid max-w-lg grid-cols-3 gap-6">
              <Feature icon={<Ticket className="h-5 w-5" />} label="QR único" />
              <Feature icon={<ShieldCheck className="h-5 w-5" />} label="Compra segura" />
              <Feature icon={<Sparkles className="h-5 w-5" />} label="Cupons ao vivo" />
            </dl>
          </motion.div>
        </div>
      </section>

      {/* EVENTS */}
      <section id="eventos" className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Próximas noites</p>
            <h2 className="display mt-2 text-4xl md:text-5xl">Programação</h2>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-dashed border-destructive/40 bg-card/50 p-12 text-center">
            <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-flame" />
            <h3 className="display text-2xl">Não foi possível carregar os eventos</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Verifique sua conexão e tente novamente.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : !events || events.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                {i === 0 ? <FeaturedEventCard event={event} /> : <EventCard event={event} />}
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="text-primary">{icon}</div>
      <dt className="text-sm font-medium">{label}</dt>
    </div>
  );
}

type EventCardData = Pick<
  Tables<"events">,
  "id" | "slug" | "title" | "tagline" | "venue" | "city" | "starts_at" | "cover_url" | "cover_path"
>;

function FeaturedEventCard({ event }: { event: EventCardData }) {
  const cover = useCoverUrl(event.cover_path, event.cover_url);
  return (
    <Link
      to="/events/$slug"
      params={{ slug: event.slug }}
      className="group relative block overflow-hidden rounded-3xl border border-border/60 bg-card transition hover:border-primary/60 hover:-translate-y-1 hover:glow-primary"
    >
      <div className="absolute -inset-0.5 -z-10 rounded-3xl bg-gradient-to-r from-primary to-accent opacity-30 blur-sm transition duration-1000 group-hover:opacity-60" />
      <div className="relative aspect-[4/5] overflow-hidden bg-surface md:aspect-[16/10]">
        {cover ? (
          <img
            src={cover}
            alt={event.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/40 to-accent/30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="absolute left-4 top-4">
          <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg">
            Destaque da semana
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h3 className="display text-3xl leading-tight tracking-wide md:text-2xl">
            {event.title}
          </h3>
          {event.tagline && (
            <p className="mt-1 line-clamp-2 text-sm text-white/70">{event.tagline}</p>
          )}
          <div className="mt-4 flex flex-col gap-2 text-sm text-white/60">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateLong(event.starts_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {event.venue ?? event.city ?? "Local a confirmar"}
            </span>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white/80">
              Ver detalhes
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-transform group-hover:translate-x-1">
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EventCard({ event }: { event: EventCardData }) {
  const cover = useCoverUrl(event.cover_path, event.cover_url);
  return (
    <Link
      to="/events/$slug"
      params={{ slug: event.slug }}
      className="group block overflow-hidden rounded-2xl border border-border/60 bg-card transition hover:border-primary/60 hover:-translate-y-1 hover:glow-primary"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface">
        {cover ? (
          <img
            src={cover}
            alt={event.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/40 to-accent/30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs backdrop-blur">
          <Calendar className="h-3 w-3" />
          {formatDateLong(event.starts_at)}
        </div>
      </div>
      <div className="p-5">
        <h3 className="display text-2xl leading-tight tracking-wide">{event.title}</h3>
        {event.tagline && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{event.tagline}</p>
        )}
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {event.venue ?? event.city ?? "Local a confirmar"}
          </span>
          <span className="text-primary group-hover:translate-x-1 transition">
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border/60 bg-card/50 p-12 text-center">
      <Speaker
        aria-hidden
        className="pointer-events-none absolute -right-10 -bottom-10 w-56 select-none opacity-10 mix-blend-screen"
      />
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Ticket className="h-6 w-6" />
      </div>
      <h3 className="display text-2xl">Nenhum evento no ar ainda</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Os produtores estão finalizando a próxima noite. Volte em breve.
      </p>
      <Button variant="outline" asChild className="mt-6">
        <Link to="/admin">Sou produtor</Link>
      </Button>
    </div>
  );
}
