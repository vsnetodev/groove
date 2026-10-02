import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const required = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_URL",
];
const errors = [];
for (const key of required) {
  if (!process.env[key] || process.env[key].includes("YOUR_"))
    errors.push(`${key}: configure um valor real.`);
}
for (const key of ["VITE_SUPABASE_URL", "SUPABASE_URL", "APP_URL"]) {
  try {
    const url = new URL(process.env[key]);
    if (!["https:", "http:"].includes(url.protocol)) throw Error();
  } catch {
    errors.push(`${key}: URL inválida.`);
  }
}
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
try {
  if (key.startsWith("sb_secret_")) throw Error();
  if (!key.startsWith("sb_publishable_")) {
    const claims = JSON.parse(Buffer.from(key.split(".")[1] || "", "base64url").toString());
    if (claims.role !== "anon") throw Error();
  }
} catch {
  errors.push("A chave VITE_SUPABASE_PUBLISHABLE_KEY deve ser pública, nunca service_role/secret.");
}
if (process.env.VITE_SUPABASE_URL !== process.env.SUPABASE_URL)
  errors.push("As URLs pública e do servidor devem apontar para o mesmo Supabase.");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log("Configuração básica válida. Teste o gateway no painel antes de ativar vendas.");
