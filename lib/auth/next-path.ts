const BASE = "http://duo.invalid";

// Destino depois do login ou do link do e-mail (?next=): só caminhos deste app, senão o início.
// Além de "//site", o navegador lê "/\site" como "//site" e descarta tabulações e quebras de linha ("/<TAB>/site"):
// barra invertida e caracteres de controle são recusados, e o endereço resolvido precisa continuar neste app.
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try { return new URL(value, BASE).origin === BASE ? value : "/"; } catch { return "/"; }
}
