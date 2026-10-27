// Política de conteúdo das páginas (Content-Security-Policy), montada no proxy a cada requisição.
// Script só roda com o nonce desta resposta (o Next o põe nos scripts que gera; o layout, no script de tema) e o que
// esses scripts carregarem; um texto injetado no material não executa. O navegador só conversa com o app e o Supabase
// (login, envio direto de arquivos), e o app não abre dentro de outro site.
export const NONCE_HEADER = "x-duo-nonce";

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}

export function contentSecurityPolicy(nonce: string, supabaseUrl: string | undefined, dev = process.env.NODE_ENV === "development"): string {
  let supabase = "";
  try { if (supabaseUrl) supabase = new URL(supabaseUrl).origin; } catch { /* endereço inválido: só o próprio app */ }
  const connect = supabase ? ` ${supabase} ${supabase.replace(/^http/, "ws")}` : "";
  return [
    "default-src 'self'",
    // Em desenvolvimento o Next avalia código para recarregar a tela; em produção, nunca.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Estilos inline (atributo style) são usados pelos componentes; não executam código.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
