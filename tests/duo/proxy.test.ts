import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOGIN_FAILED_MESSAGE } from "@/lib/auth/messages";
import { contentSecurityPolicy } from "@/lib/csp";

let user: { id: string } | null = null;
let profile: { role: string; active: boolean; must_change_password?: boolean } | null = null;
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: user ? { claims: { sub: user.id, email: `${user.id}@x.com` } } : null, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }),
  }),
}));

import { config, proxy } from "@/proxy";

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
  it("senha padrão ainda não trocada: só a tela de troca e a API de conta ficam abertas", async () => {
    user = { id: "n" }; profile = { role: "aluno", active: true, must_change_password: true };
    expect(location(await go("/caderno"))).toBe("/trocar-senha");
    expect(location(await go("/login"))).toBe("/trocar-senha");
    expect(location(await go("/trocar-senha"))).toBeNull();
    expect(location(await go("/api/conta/senha"))).toBeNull();
    expect((await go("/api/destaques")).status).toBe(403);
  });
  it("quem já trocou a senha não volta para /trocar-senha", async () => {
    user = { id: "a" }; profile = { role: "aluno", active: true, must_change_password: false };
    expect(location(await go("/trocar-senha"))).toBe("/");
  });
  it("repassa a identidade conferida e descarta a que vier do navegador", async () => {
    const forged = new NextRequest(new URL("/caderno", "http://app.duo"), { headers: { "x-duo-uid": "outro", "x-duo-role": "equipe" } });
    expect((await proxy(forged)).headers.get("x-middleware-request-x-duo-uid")).toBeNull(); // anônimo: nada repassado
    user = { id: "a" }; profile = { role: "aluno", active: true };
    const response = await proxy(new NextRequest(new URL("/caderno", "http://app.duo"), { headers: { "x-duo-uid": "outro", "x-duo-role": "equipe" } }));
    expect(response.headers.get("x-middleware-request-x-duo-uid")).toBe("a");
    expect(response.headers.get("x-middleware-request-x-duo-role")).toBe("aluno");
  });
  it("logado e ativo no /login vai para o início", async () => {
    user = { id: "a" }; profile = { role: "aluno", active: true };
    expect(location(await go("/login"))).toBe("/");
  });
});

describe("política de conteúdo (CSP)", () => {
  const directive = (policy: string, name: string) => policy.split("; ").find((item) => item.startsWith(`${name} `)) ?? "";
  it("cada resposta leva um nonce novo, na política e no cabeçalho interno; o que vier do navegador é descartado", async () => {
    user = { id: "a" }; profile = { role: "aluno", active: true };
    const forged = new NextRequest(new URL("/caderno", "http://app.duo"), { headers: { "x-duo-nonce": "forjado" } });
    const [first, second] = [await proxy(forged), await go("/caderno")];
    const nonce = first.headers.get("x-middleware-request-x-duo-nonce") as string;
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(nonce).not.toBe("forjado");
    expect(second.headers.get("x-middleware-request-x-duo-nonce")).not.toBe(nonce);
    expect(directive(first.headers.get("content-security-policy") as string, "script-src")).toBe(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    // O Next lê o nonce da política que chega na requisição para marcar os scripts que ele gera.
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(first.headers.get("content-security-policy"));
  });
  it("vale também nas páginas públicas e sem o Supabase configurado", async () => {
    expect((await go("/login")).headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await go("/configuracao")).headers.get("content-security-policy")).toContain("connect-src 'self';");
  });
  it("script só com nonce (nada inline nem eval em produção); conexões só com o app e o Supabase; sem iframe", () => {
    const policy = contentSecurityPolicy("abc", "https://x.supabase.co/", false);
    expect(directive(policy, "script-src")).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://x.supabase.co wss://x.supabase.co");
    for (const rule of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "worker-src 'self'"]) expect(policy).toContain(rule);
    expect(directive(contentSecurityPolicy("abc", "https://x.supabase.co", true), "script-src")).toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy("abc", "não é url", false), "connect-src")).toBe("connect-src 'self'");
  });
});

describe("onde o proxy roda", () => {
  // O utilitário de teste do Next aplica o matcher como na hospedagem; fora do servidor ele precisa do AsyncLocalStorage.
  const runs = async (url: string) => {
    (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
    const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
    return unstable_doesMiddlewareMatch({ config, url });
  };
  it("em toda página e rota, mesmo com endereço terminado em .png ou .js (senão a identidade forjada passaria)", async () => {
    for (const url of ["/", "/caderno", "/disciplinas/penal/x.png", "/api/destaques/x.js", "/nada.css", "/brand"]) expect(await runs(url), url).toBe(true);
  });
  it("não nos arquivos estáticos, que a tela de login também usa", async () => {
    for (const url of ["/_next/static/chunks/app.js", "/_next/image", "/brand/pena-branca.png", "/icons/icon-192.png", "/sw.js", "/manifest.webmanifest", "/favicon.ico"]) expect(await runs(url), url).toBe(false);
  });
});

describe("mensagem do login", () => {
  it("não revela se o e-mail é de aluno", () => {
    expect(LOGIN_FAILED_MESSAGE).toBe("E-mail ou senha incorretos. Use o e-mail da sua matrícula.");
  });
});
