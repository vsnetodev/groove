type TicketPrintData = {
  eventTitle: string;
  batchName?: string | null;
  dateLabel?: string | null;
  venue?: string | null;
  holderName?: string | null;
  codeLabel: string;
  qrSvg: string;
  logoUrl?: string | null;
  status?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Abre uma janela com uma versão limpa do ingresso e dispara a impressão.
 * O usuário pode imprimir em papel ou escolher "Salvar como PDF".
 */
export function printTicket(data: TicketPrintData) {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return false;

  const rows = [
    data.batchName ? ["Ingresso", data.batchName] : null,
    data.dateLabel ? ["Data", data.dateLabel] : null,
    data.venue ? ["Local", data.venue] : null,
    data.holderName ? ["Titular", data.holderName] : null,
    data.status ? ["Situação", data.status] : null,
  ].filter(Boolean) as string[][];

  win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Ingresso — ${escapeHtml(data.eventTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #14121a; background: #fff; }
  .card { max-width: 620px; margin: 0 auto; border: 1px solid #d8d3e0; border-radius: 18px; padding: 28px; }
  .brand { display: flex; align-items: center; gap: 12px; border-bottom: 1px dashed #d8d3e0; padding-bottom: 16px; }
  .brand img { width: 44px; height: 44px; border-radius: 999px; }
  .brand strong { font-size: 15px; letter-spacing: .12em; text-transform: uppercase; }
  h1 { font-size: 26px; margin: 20px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
  td { padding: 6px 0; vertical-align: top; }
  td.k { width: 110px; color: #6b6577; text-transform: uppercase; font-size: 11px; letter-spacing: .08em; padding-top: 9px; }
  .qr { text-align: center; margin-top: 24px; padding-top: 24px; border-top: 1px dashed #d8d3e0; }
  .qr svg { width: 240px; height: 240px; }
  .code { margin-top: 10px; font-family: ui-monospace, monospace; font-size: 12px; color: #6b6577; }
  .note { margin-top: 18px; text-align: center; font-size: 11px; color: #6b6577; }
  @media print { body { padding: 0; } .card { border: none; } }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">
      ${data.logoUrl ? `<img src="${escapeHtml(data.logoUrl)}" alt="Groove Produções" />` : ""}
      <strong>Groove Produções</strong>
    </div>
    <h1>${escapeHtml(data.eventTitle)}</h1>
    <table>
      ${rows
        .map(([k, v]) => `<tr><td class="k">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
        .join("")}
    </table>
    <div class="qr">
      ${data.qrSvg}
      <div class="code">${escapeHtml(data.codeLabel)}</div>
    </div>
    <p class="note">Guarde este QR Code. Ele é único e será validado na entrada.</p>
  </div>
  <script>
    (function () {
      var go = function () { window.focus(); window.print(); };
      var img = document.images[0];
      if (img && !img.complete) { img.onload = go; img.onerror = go; } else { setTimeout(go, 150); }
    })();
  </script>
</body>
</html>`);
  win.document.close();
  return true;
}
