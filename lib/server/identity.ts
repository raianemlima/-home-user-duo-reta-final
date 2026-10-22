import "server-only";
import { headers } from "next/headers";

// Quem está logado, conferido UMA vez por requisição no proxy (proxy.ts) e repassado nestes cabeçalhos internos.
// O proxy apaga qualquer valor que venha do navegador antes de gravar o seu, então aqui eles são confiáveis.
export const IDENTITY_HEADERS = { id: "x-duo-uid", email: "x-duo-email", role: "x-duo-role" } as const;
export type Identity = { id: string; email: string; role: "equipe" | "aluno" };

export async function identityFromRequest(): Promise<Identity | null> {
  try {
    const store = await headers();
    const id = store.get(IDENTITY_HEADERS.id);
    if (!id) return null;
    return { id, email: store.get(IDENTITY_HEADERS.email) ?? "", role: store.get(IDENTITY_HEADERS.role) === "equipe" ? "equipe" : "aluno" };
  } catch { return null; } // fora de uma requisição (testes, scripts)
}
