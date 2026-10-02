import { supabase } from "@/integrations/supabase/client";

export const COVER_BUCKET = "event-covers";
export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_MIN_WIDTH = 1280;
export const COVER_MIN_HEIGHT = 720;
export const COVER_ACCEPT = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export type CoverValidationError = { message: string };

export function validateCoverFile(file: File): CoverValidationError | null {
  if (!COVER_ACCEPT.includes(file.type)) {
    return { message: "Use uma imagem JPG, PNG ou WebP." };
  }
  if (file.size > COVER_MAX_BYTES) {
    return { message: "A imagem ultrapassa o limite de 5 MB." };
  }
  return null;
}

export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

/** Redimensiona para no máximo 1600px de largura e converte para WebP. */
export async function compressCover(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxW = 1600;
    const scale = Math.min(1, maxW / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function safeName() {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `cover-${Date.now()}-${rand}.webp`;
}

export async function uploadCover(eventId: string, file: File): Promise<string> {
  const blob = await compressCover(file);
  const path = `${eventId}/${safeName()}`;
  const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, blob, {
    contentType: blob.type || "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeCover(path: string | null | undefined) {
  if (!path) return;
  const { error } = await supabase.storage.from(COVER_BUCKET).remove([path]);
  if (error) console.error("[event-covers] remove failed", error);
}

const signedCache = new Map<string, { url: string; exp: number }>();

export async function getCoverUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const cached = signedCache.get(path);
  if (cached && cached.exp > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(COVER_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
