import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ImagePlus, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import {
  COVER_ACCEPT,
  COVER_MIN_HEIGHT,
  COVER_MIN_WIDTH,
  readImageSize,
  validateCoverFile,
} from "@/lib/event-covers";
import { useCoverUrl } from "@/hooks/use-cover-url";

type Props = {
  existingPath?: string | null;
  existingUrl?: string | null;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onRemoveExisting?: () => void;
  uploading?: boolean;
  progress?: number;
};

export function CoverUpload({
  existingPath,
  existingUrl,
  file,
  onFileChange,
  onRemoveExisting,
  uploading = false,
  progress = 0,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const remoteUrl = useCoverUrl(existingPath, existingUrl);

  useEffect(() => {
    if (!file) {
      setLocalPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const preview = localPreview ?? remoteUrl;

  const accept = async (picked: File | undefined | null) => {
    if (!picked) return;
    const invalid = validateCoverFile(picked);
    if (invalid) return toast.error(invalid.message);
    try {
      const { width, height } = await readImageSize(picked);
      if (width < COVER_MIN_WIDTH || height < COVER_MIN_HEIGHT) {
        return toast.error(
          `Resolução muito baixa (${width}×${height}). Mínimo ${COVER_MIN_WIDTH}×${COVER_MIN_HEIGHT} pixels.`,
        );
      }
    } catch {
      return toast.error("Não foi possível ler a imagem selecionada.");
    }
    onFileChange(picked);
  };

  return (
    <div>
      <Label className="mb-1.5 block">Imagem de capa</Label>
      <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
        Proporção recomendada 16:9 · Resolução recomendada 1600 × 900 px · Mínima 1280 × 720 px ·
        Formatos JPG, JPEG, PNG ou WebP · Máximo 5 MB.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void accept(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={`relative flex aspect-[16/9] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition ${
          dragging
            ? "border-primary bg-primary/10"
            : "border-border/60 bg-surface hover:border-primary/50"
        }`}
      >
        {preview ? (
          <img
            src={preview}
            alt="Pré-visualização da capa"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-muted-foreground">
            <ImagePlus className="h-8 w-8 text-primary" />
            <p className="text-sm">Clique para escolher ou arraste a imagem aqui</p>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur">
            <UploadCloud className="h-6 w-6 animate-pulse text-primary" />
            <Progress value={progress} className="w-2/3" />
            <p className="text-xs text-muted-foreground">Enviando imagem…</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={COVER_ACCEPT.join(",")}
        className="hidden"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {(preview || file) && (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            Substituir
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={() => {
              if (file) onFileChange(null);
              else onRemoveExisting?.();
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" /> Remover
          </Button>
        </div>
      )}
    </div>
  );
}
