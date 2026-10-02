import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useState } from "react";
import { checkInTicket } from "@/lib/tickets-admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, ScanLine, Clock, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRoles } from "@/hooks/use-session";
import { ClientOnly } from "@tanstack/react-router";

const QrCameraScanner = lazy(() => import("@/components/qr-camera-scanner"));

export const Route = createFileRoute("/_authenticated/admin/checkin")({
  component: CheckIn,
});

type Result =
  | { ok: true; holder_name?: string; event_title?: string; batch_name?: string }
  | {
      ok: false;
      reason: string;
      holder_name?: string;
      event_title?: string;
      batch_name?: string;
      checked_in_at?: string;
    };

function CheckIn() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const isMobile = useIsMobile();
  const { isAdmin } = useRoles();
  const canScan = isMobile && isAdmin;

  const runValidation = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setLoading(true);
    setResult(null);
    // Aceita o token seguro do QR (hex de 64 caracteres) ou o código legado em UUID.
    const uuidMatch = value.match(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
    const tokenMatch = value.match(/\b[0-9a-fA-F]{64}\b/);
    let data: Result;
    try {
      data = (await checkInTicket({
        data: tokenMatch
          ? { token: tokenMatch[0] }
          : uuidMatch
            ? { code: uuidMatch[0] }
            : { code: value },
      })) as Result;
    } catch (e) {
      setLoading(false);
      toast.error(e instanceof Error ? e.message : "Não foi possível validar o ingresso.");
      return;
    }
    setLoading(false);
    setResult(data);
    setCode("");
  }, []);

  const validate = async (e: React.FormEvent) => {
    e.preventDefault();
    await runValidation(code);
  };

  const handleDetected = useCallback(
    (value: string) => {
      setScanning(false);
      void runValidation(value);
    },
    [runValidation],
  );

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          <h2 className="display text-2xl">Validar ingresso</h2>
        </div>
        <form onSubmit={validate} className="space-y-3">
          <div>
            <Label htmlFor="code">Código do ingresso</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Cole o código do QR aqui"
              className="font-mono"
              autoFocus
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Aponte a câmera do celular para o QR e cole o texto lido acima.
            </p>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary to-[oklch(0.72_0.22_340)]"
          >
            {loading ? "Validando..." : "Validar entrada"}
          </Button>
        </form>

        {canScan && !scanning && (
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full border-primary/50 text-primary"
            onClick={() => setScanning(true)}
          >
            <Camera className="mr-2 h-4 w-4" /> Ler QR com a câmera
          </Button>
        )}
      </div>

      {canScan && scanning && (
        <ClientOnly fallback={null}>
          <Suspense
            fallback={<p className="mt-4 text-sm text-muted-foreground">Abrindo câmera...</p>}
          >
            <QrCameraScanner onDetected={handleDetected} onClose={() => setScanning(false)} />
          </Suspense>
        </ClientOnly>
      )}

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={JSON.stringify(result)}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mt-4 rounded-2xl border p-6 ${
              result.ok
                ? "border-primary/60 bg-primary/10"
                : result.reason === "already_checked_in"
                  ? "border-flame/60 bg-flame/10"
                  : "border-destructive/60 bg-destructive/10"
            }`}
          >
            {result.ok ? (
              <>
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-6 w-6" />
                  <p className="display text-2xl">ACESSO LIBERADO</p>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Portador:</span> {result.holder_name}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Evento:</span> {result.event_title}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Ingresso:</span> {result.batch_name}
                  </p>
                </div>
              </>
            ) : result.reason === "already_checked_in" ? (
              <>
                <div className="flex items-center gap-2 text-flame">
                  <Clock className="h-6 w-6" />
                  <p className="display text-2xl">JÁ UTILIZADO</p>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Portador:</span> {result.holder_name}
                  </p>
                  {result.checked_in_at && (
                    <p>
                      <span className="text-muted-foreground">Entrada em:</span>{" "}
                      {new Date(result.checked_in_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-6 w-6" />
                  <p className="display text-2xl">
                    {result.reason === "not_found" ? "INGRESSO INVÁLIDO" : "INGRESSO CANCELADO"}
                  </p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Peça outro código ou verifique com o comprador.
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
