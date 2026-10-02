import { useWhatsappSettings, whatsappLink } from "@/hooks/use-platform-settings";

/** Botão flutuante que leva o participante direto para o WhatsApp do organizador. */
export function WhatsappFab() {
  const { data } = useWhatsappSettings();
  const href = whatsappLink(data?.number ?? null, data?.message ?? null);
  if (!data?.enabled || !href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[oklch(0.72_0.18_150)] text-background shadow-lg ring-1 ring-black/20 transition hover:scale-105 active:scale-95"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden="true">
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.13-.42-2.15-1.33-.8-.71-1.33-1.59-1.48-1.89-.15-.3-.02-.46.13-.61.15-.15.32-.37.47-.55.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.06 2.87 1.21 3.07.15.2 2.09 3.2 5.06 4.37.71.28 1.26.45 1.69.57.71.19 1.36.16 1.87.1.57-.07 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
        <path d="M12.04 2C6.6 2 2.19 6.41 2.19 11.85c0 1.74.45 3.44 1.32 4.94L2 22l5.35-1.4a9.83 9.83 0 0 0 4.69 1.19h.01c5.43 0 9.85-4.41 9.85-9.85C21.9 6.41 17.47 2 12.04 2Zm0 17.94h-.01a8.15 8.15 0 0 1-4.15-1.14l-.3-.18-3.08.81.82-3.01-.19-.31a8.11 8.11 0 0 1-1.24-4.32c0-4.5 3.66-8.16 8.16-8.16 2.18 0 4.23.85 5.77 2.39a8.11 8.11 0 0 1 2.39 5.77c0 4.5-3.67 8.15-8.17 8.15Z" />
      </svg>
    </a>
  );
}
