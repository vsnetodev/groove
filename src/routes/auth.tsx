import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import logoUrl from "@/assets/logo.png";

const searchSchema = z.object({
  next: z
    .string()
    .refine((v) => v.startsWith("/") && !v.startsWith("//"))
    .refine((v) => !v.includes("\\"))
    .optional()
    .catch(undefined),
  mode: z.enum(["signin", "signup"]).optional(),
  type: z.enum(["participante", "produtor"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — Casa Groove" },
      {
        name: "description",
        content: "Entre na Casa Groove para comprar ingressos e ver seus QR Codes.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next, mode: initialMode, type: initialType } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(
    initialMode ?? (initialType ? "signup" : "signin"),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<"participante" | "produtor">(
    initialType ?? "participante",
  );
  const [loading, setLoading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: next ?? "/", replace: true });
    });
  }, [navigate, next]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Enviamos um link de recuperação para o seu e-mail.");
        setMode("signin");
        return;
      }
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name, account_type: accountType },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setPendingConfirm(email);
          toast.success("Confirme seu e-mail para ativar a conta.");
          return;
        }
        toast.success("Conta criada! Bem-vindo à Casa Groove.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
      }
      navigate({ to: next ?? "/", replace: true });
    } catch (err: unknown) {
      toast.error(
        (err instanceof Error ? err.message : "Não foi possível autenticar.") ??
          "Erro ao autenticar",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`,
        },
      });
      if (error) throw error;
    } catch {
      toast.error("Não foi possível entrar com Google. Verifique a configuração do provedor.");
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full rounded-3xl border border-border/60 bg-card/80 backdrop-blur p-8 shadow-[var(--shadow-card)]"
      >
        {pendingConfirm ? (
          <div className="text-center">
            <img
              src={logoUrl}
              alt="Groove Produções"
              className="mx-auto h-14 w-14 rounded-full ring-2 ring-primary/50 mb-3"
            />
            <h1 className="display text-3xl">Confirme seu e-mail</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Enviamos um link de confirmação para{" "}
              <span className="text-foreground">{pendingConfirm}</span>. Clique nele para ativar sua
              conta e entrar.
            </p>
            <Button
              variant="outline"
              className="mt-6 w-full"
              onClick={() => {
                setPendingConfirm(null);
                setMode("signin");
              }}
            >
              Voltar para o login
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center text-center mb-6">
              <img
                src={logoUrl}
                alt="Groove Produções"
                className="h-14 w-14 rounded-full ring-2 ring-primary/50 mb-3"
              />
              <h1 className="display text-3xl">
                {mode === "signup"
                  ? "Criar conta"
                  : mode === "forgot"
                    ? "Recuperar senha"
                    : "Entrar"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "signup"
                  ? "Uma conta, todos os seus ingressos."
                  : mode === "forgot"
                    ? "Enviaremos um link para você criar uma nova senha."
                    : "Continue sua noite."}
              </p>
            </div>

            {mode !== "forgot" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogle}
                  disabled={loading}
                  className="w-full mb-4 gap-2 border-border/60 hover:bg-surface-hi"
                >
                  <GoogleIcon /> Continuar com Google
                </Button>

                <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                  <div className="h-px flex-1 bg-border/60" />
                  ou
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              </>
            )}

            <form onSubmit={handleEmail} className="space-y-3">
              {mode === "signup" && (
                <>
                  <div>
                    <Label htmlFor="name">Nome completo</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <Label>Tipo de conta</Label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      {(["participante", "produtor"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAccountType(t)}
                          className={`rounded-lg border px-3 py-2 text-sm capitalize transition ${
                            accountType === t
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/60 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t === "participante" ? "Participante" : "Produtor"}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {accountType === "participante"
                        ? "Compre ingressos e acesse seus QR Codes."
                        : "Crie e gerencie seus próprios eventos."}
                    </p>
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              {mode !== "forgot" && (
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="mt-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)] hover:opacity-90"
              >
                {loading
                  ? "Aguarde..."
                  : mode === "signup"
                    ? "Criar conta"
                    : mode === "forgot"
                      ? "Enviar link"
                      : "Entrar"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signup" ? "Já tem conta?" : "Novo por aqui?"}{" "}
              <button
                className="text-primary hover:underline font-medium"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? "Entre" : "Crie sua conta"}
              </button>
            </p>
          </>
        )}
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            ← Voltar
          </Link>
        </p>
      </motion.div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.6-2.6C16.7 3.6 14.6 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12s4.2 9.3 9.3 9.3c5.4 0 8.9-3.8 8.9-9.1 0-.6 0-1-.1-1.5H12z"
      />
    </svg>
  );
}
