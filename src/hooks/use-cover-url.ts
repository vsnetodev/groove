import { useQuery } from "@tanstack/react-query";
import { getCoverUrl } from "@/lib/event-covers";

/** Resolve a URL de exibição da capa: caminho no Storage ou URL externa. */
export function useCoverUrl(coverPath?: string | null, fallbackUrl?: string | null) {
  const { data } = useQuery({
    queryKey: ["cover-url", coverPath],
    queryFn: () => getCoverUrl(coverPath),
    enabled: !!coverPath,
    staleTime: 45 * 60 * 1000,
  });
  return coverPath ? (data ?? null) : (fallbackUrl ?? null);
}
