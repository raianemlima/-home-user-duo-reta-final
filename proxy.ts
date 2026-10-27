import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

// Mesmos nomes de lib/server/identity.ts (que não pode ser importado aqui por ser "server-only").
const IDENTITY = { id: "x-duo-uid", email: "x-duo-email", role: "x-duo-role" } as const;

const PUBLIC_PATHS = ["/login", "/configuracao", "/privacidade"];

export async function proxy(request: NextRequest) {
  const { url, key } = getSupabaseConfig();
  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth");
  const isApi = pathname.startsWith("/api/");

  if (!url || !key) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/configuracao", request.url));
  }

  // Nunca aceitar identidade vinda do navegador: os cabeçalhos internos só saem daqui.
  for (const name of Object.values(IDENTITY)) request.headers.delete(name);
  const refreshed: { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        refreshed.push(...cookiesToSet);
      },
    },
  });
  // getClaims confere o token localmente (chaves públicas do projeto) e só vai ao servidor de login se precisar.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const user = claims?.sub ? { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" } : null;
  // Segue a requisição com os cookies renovados e, se houver sessão válida, a identidade conferida.
  const pass = (identity?: { id: string; email: string; role: string }) => {
    const forwarded = new Headers(request.headers);
    if (identity) { forwarded.set(IDENTITY.id, identity.id); forwarded.set(IDENTITY.email, identity.email); forwarded.set(IDENTITY.role, identity.role); }
    const next = NextResponse.next({ request: { headers: forwarded } });
    refreshed.forEach(({ name, value, options }) => next.cookies.set(name, value, options));
    return next;
  };

  if (!user) {
    if (isPublic) return pass();
    if (isApi) return NextResponse.json({ error: { code: "unauthenticated", message: "Sua sessão expirou. Entre novamente para continuar." } }, { status: 401 });
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  // Papel e situação vêm do perfil a cada requisição: desativar um aluno vale na hora, sem esperar o token expirar.
  const { data: profile } = await supabase.from("profiles").select("role, active, must_change_password").eq("user_id", user.id).maybeSingle();
  const active = Boolean(profile?.active);
  if (!active) {
    if (isPublic) return pass();
    if (isApi) return NextResponse.json({ error: { code: "forbidden", message: "Seu acesso ao curso não está ativo." } }, { status: 403 });
    return NextResponse.redirect(new URL("/login?motivo=sem-acesso", request.url));
  }
  if (pathname === "/login") return NextResponse.redirect(new URL(profile?.must_change_password ? "/trocar-senha" : "/", request.url));
  // Senha padrão ainda não trocada: só a tela de troca e a API de conta ficam disponíveis.
  if (profile?.must_change_password && pathname !== "/trocar-senha" && !pathname.startsWith("/api/conta/")) {
    if (isApi) return NextResponse.json({ error: { code: "password_change_required", message: "Troque a senha inicial para continuar." } }, { status: 403 });
    return NextResponse.redirect(new URL("/trocar-senha", request.url));
  }
  if (pathname === "/trocar-senha" && !profile?.must_change_password) return NextResponse.redirect(new URL("/", request.url));
  const staffArea = pathname === "/equipe" || pathname.startsWith("/equipe/") || pathname.startsWith("/api/equipe/") || pathname === "/api/equipe";
  if (staffArea && profile?.role !== "equipe") {
    if (isApi) return NextResponse.json({ error: { code: "forbidden", message: "Acesso restrito à equipe." } }, { status: 403 });
    return NextResponse.redirect(new URL("/", request.url));
  }
  return pass({ id: user.id, email: user.email, role: profile?.role === "equipe" ? "equipe" : "aluno" });
}

// Ficam de fora só os arquivos estáticos de verdade. Pular por extensão (".png", ".js"…) deixava qualquer endereço
// terminado assim ("/disciplinas/x/y.png") sem o proxy e, portanto, sem a limpeza dos cabeçalhos de identidade:
// a identidade forjada pelo navegador chegava ao layout, às páginas e às rotas.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|brand/|icons/).*)"],
};
