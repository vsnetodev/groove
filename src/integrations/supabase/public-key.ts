/** Public environment variables must never contain a privileged Supabase key. */
export function assertPublicKey(key: string): void {
  if (key.startsWith("sb_secret_"))
    throw new Error("Use uma chave pública do Supabase no navegador.");
  if (key.startsWith("sb_publishable_")) return;
  try {
    const payload = key.split(".")[1];
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.role !== "anon") throw new Error("invalid_role");
  } catch {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY deve ser uma chave publishable ou anon.");
  }
}
