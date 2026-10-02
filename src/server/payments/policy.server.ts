/** The canonical origin must be configured in production; request Host is untrusted. */
export function checkoutOrigin(requestUrl: string): string {
  const configured = process.env.APP_URL;
  const url = new URL(configured || requestUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!configured && !local) || (!local && url.protocol !== "https:")) {
    throw new Error("Configure APP_URL com a URL HTTPS pública do aplicativo.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("APP_URL deve conter somente a origem, sem caminho ou credenciais.");
  }
  return url.origin;
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at > 0 ? `${email[0]}***@${email.slice(at + 1)}` : null;
}
