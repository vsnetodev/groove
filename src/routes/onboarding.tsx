import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { chooseAccountType } from "@/lib/onboarding.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Ticket, Megaphone } from "lucide-react";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Escolha seu tipo de conta — Clube Groove" },
      {
        name: "description",
        content: "Participante ou Produtor? Escolha como você quer usar a Clube Groove.",
      },
      { property: "og:title", content: "Escolha seu tipo de conta — Clube Groove" },
      {
        property: "og:description",
        content: "Compre ingressos ou crie e venda seus próprios eventos na Clube Groove.",
      },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<"participante" | "produtor">("participante");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate({ to: "/auth", replace: true });
    });
  }, [navigate]);

  const confirm = async () => {
    setSaving(true);
    try {
      await chooseAccountType({ data: { type: choice } });
    } catch (e) {
      setSaving(false);
      toast.error(
        `Não foi possível salvar sua escolha: ${e instanceof Error ? e.message : "erro"}`,
      );
      return;
    }
    setSaving(false);
    toast.success(choice === "produtor" ? "Conta de produtor pronta!" : "Tudo certo, bom show!");
    navigate({ to: choice === "produtor" ? "/admin" : "/", replace: true });
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full rounded-3xl border border-border/60 bg-card/80 p-8 backdrop-blur"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={logoUrl}
            alt="Groove Produções"
            className="mb-3 h-14 w-14 rounded-full ring-2 ring-primary/50"
          />
          <h1 className="display text-3xl">Como você vai usar a Clube Groove?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Você pode pedir a mudança depois com o suporte.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Option
            active={choice === "participante"}
            onClick={() => setChoice("participante")}
            icon={<Ticket className="h-5 w-5" />}
            title="Participante"
            desc="Quero comprar ingressos e acessar meus QR Codes."
          />
          <Option
            active={choice === "produtor"}
            onClick={() => setChoice("produtor")}
            icon={<Megaphone className="h-5 w-5" />}
            title="Produtor"
            desc="Quero criar e vender meus próprios eventos."
          />
        </div>

        <Button
          onClick={confirm}
          disabled={saving}
          size="lg"
          className="mt-6 w-full bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)] hover:opacity-90"
        >
          {saving ? "Salvando..." : "Continuar"}
        </Button>
      </motion.div>
    </main>
  );
}

function Option({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left transition ${
        active ? "border-primary bg-primary/10" : "border-border/60 hover:border-border"
      }`}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      <p className="mt-2 font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}
