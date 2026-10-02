import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

type Props = {
  onDetected: (value: string) => void;
  onClose: () => void;
};

const REGION_ID = "qr-camera-region";

export default function QrCameraScanner({ onDetected, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const instance = new Html5Qrcode(REGION_ID, { verbose: false });
        scanner = instance as unknown as { stop: () => Promise<void>; clear: () => void };
        if (cancelled) return;
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (stoppedRef.current) return;
            stoppedRef.current = true;
            onDetected(decoded);
          },
          () => {},
        );
      } catch (e) {
        setError(
          e instanceof Error && e.message
            ? "Não foi possível acessar a câmera. Verifique a permissão no navegador."
            : "Não foi possível acessar a câmera.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => {});
      }
    };
  }, [onDetected]);

  return (
    <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-primary">
          <Camera className="h-4 w-4" /> Aponte para o QR do ingresso
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div id={REGION_ID} className="overflow-hidden rounded-xl bg-black [&_video]:w-full" />
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
