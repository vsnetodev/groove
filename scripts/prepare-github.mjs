import { readdir, mkdir, copyFile, writeFile, stat, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = path.join(root, "upload-github", new Date().toISOString().replace(/[:.]/g, "-"));
const excluded = new Set([
  "node_modules",
  ".git",
  ".output",
  ".wrangler",
  "dist",
  "dist-ssr",
  ".tanstack",
  ".vinxi",
  ".nitro",
  "coverage",
  "artifacts",
  "upload-github",
]);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (
      excluded.has(name) ||
      (name.startsWith(".env") && name !== ".env.example") ||
      name.startsWith(".dev.vars") ||
      /\.(log|local|pem|key|rar|zip)$/i.test(name)
    )
      continue;
    const full = path.join(dir, name);
    if (entry.isSymbolicLink()) throw new Error(`Link simbólico não permitido: ${name}`);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile()) {
      if ((await stat(full)).size > 24 * 1024 * 1024)
        throw new Error(`Arquivo grande para upload web: ${name}`);
      files.push(path.relative(root, full));
    }
  }
}
await walk(root);
files.sort((a, b) => a.localeCompare(b, "en"));
await mkdir(output, { recursive: true });
for (let i = 0; i < files.length; i++) {
  const rel = files[i];
  const dest = path.join(output, `PARTE-${String(Math.floor(i / 80) + 1).padStart(2, "0")}`, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(path.join(root, rel), dest);
}
await writeFile(
  path.join(output, "LEIA-ME.txt"),
  `Upload pelo navegador: ${files.length} arquivos, no máximo 80 por parte.\n\n` +
    "Abra o repositório na RAIZ. Arraste o CONTEÚDO de PARTE-01 para Upload files e confirme Commit changes.\n" +
    "Repita para as demais partes, sempre na raiz. Não envie a pasta PARTE-XX em si.\n" +
    "Ative Exibir > Itens ocultos no Windows para incluir .github, .gitignore e .env.example.\n" +
    "O GitHub combina as pastas src repetidas mantendo seus caminhos.\n" +
    "Só conecte o deploy depois de enviar todas as partes. Nunca envie um .env preenchido.\n",
);
console.log(
  `Preparado: ${output}\n${files.length} arquivos em ${Math.ceil(files.length / 80)} partes.`,
);
