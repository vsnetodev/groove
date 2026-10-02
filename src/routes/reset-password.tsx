import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nova senha — Casa Groove" },
      { name: "description", content: "Defina uma nova senha para sua conta Casa Groove." },
      { property: "og:title", content: "Nova senha — Casa Groove" },
      { property: "og:description", content: "Defina uma nova senha para acessar seus ingressos." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const isRecovery = hash.includes("type=recovery");
    supabase.auth.getSession().then(({ data }) => {
      if (data.session || isRecovery) setReady(true);
      else {
        toast.error("Link inválido ou expirado. Solicite outro.");
        navigate({ to: "/auth", replace: true });
      }
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não conferem");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha atualizada!");
    navigate({ to: "/", replace: true });
  };

  if (!ready) return null;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-10">
      <div className="w-full rounded-3xl border border-border/60 bg-card/80 backdrop-blur p-8 shadow-[var(--shadow-card)]">
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src={logoUrl}
            alt="Groove Produções"
            className="h-14 w-14 rounded-full ring-2 ring-primary/50 mb-3"
          />
          <h1 className="display text-3xl">Nova senha</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha uma senha com pelo menos 6 caracteres.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="pw">Nova senha</Label>
            <Input
              id="pw"
              type="password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="pw2">Confirmar senha</Label>
            <Input
              id="pw2"
              type="password"
              minLength={6}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)] hover:opacity-90"
          >
            {loading ? "Salvando..." : "Salvar nova senha"}
          </Button>
        </form>
      </div>
    </main>
  );
}
