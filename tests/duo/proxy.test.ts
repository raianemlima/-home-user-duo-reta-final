import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOGIN_SENT_MESSAGE, loginMessage } from "@/lib/auth/messages";

let user: { id: string } | null = null;
let profile: { role: string; active: boolean } | null = null;
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }),
  }),
}));

import { proxy } from "@/proxy";

const go = (path: string) => proxy(new NextRequest(new URL(path, "http://app.duo")));
const location = (response: Response) => { const value = response.headers.get("location"); return value ? new URL(value).pathname + new URL(value).search : null; };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
  user = null; profile = null;
});

describe("proxy", () => {
  it("anônimo em página protegida vai para o login guardando o destino", async () => {
    expect(location(await go("/disciplinas/penal"))).toBe("/login?next=%2Fdisciplinas%2Fpenal");
  });
  it("anônimo em API recebe 401", async () => {
    expect((await go("/api/destaques")).status).toBe(401);
  });
  it("páginas públicas abrem sem sessão", async () => {
    for (const path of ["/login", "/privacidade", "/auth/confirm"]) expect(location(await go(path))).toBeNull();
  });
  it("aluno em /equipe volta para o início; em /api/equipe recebe 403", async () => {
    user = { id: "a" }; profile = { role: "aluno", active: true };
    expect(location(await go("/equipe/alunos"))).toBe("/");
    expect((await go("/api/equipe/alunos")).status).toBe(403);
    expect(location(await go("/caderno"))).toBeNull();
  });
  it("equipe acessa /equipe", async () => {
    user = { id: "e" }; profile = { role: "equipe", active: true };
    expect(location(await go("/equipe"))).toBeNull();
  });
  it("perfil inativo ou ausente vai para o login com motivo, sem laço de redirecionamento", async () => {
    user = { id: "i" }; profile = { role: "aluno", active: false };
    expect(location(await go("/caderno"))).toBe("/login?motivo=sem-acesso");
    expect(location(await go("/login?motivo=sem-acesso"))).toBeNull();
    expect((await go("/api/destaques")).status).toBe(403);
    profile = null;
    expect(location(await go("/"))).toBe("/login?motivo=sem-acesso");
  });
  it("logado e ativo no /login vai para o início", async () => {
    user = { id: "a" }; profile = { role: "aluno", active: true };
    expect(location(await go("/login"))).toBe("/");
  });
});

describe("mensagem do login", () => {
  it("é a mesma para qualquer resultado do envio", () => {
    expect(LOGIN_SENT_MESSAGE).toBe("Se este e-mail estiver cadastrado no curso, você receberá um link e um código de acesso.");
    expect(loginMessage(null)).toBe(LOGIN_SENT_MESSAGE);
    expect(loginMessage({ message: "Signups not allowed for otp" })).toBe(LOGIN_SENT_MESSAGE);
    expect(loginMessage({ message: "User not found" })).toBe(LOGIN_SENT_MESSAGE);
  });
});
