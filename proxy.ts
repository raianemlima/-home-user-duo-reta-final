import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

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

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (isPublic) return response;
    if (isApi) return NextResponse.json({ error: { code: "unauthenticated", message: "Sua sessão expirou. Entre novamente para continuar." } }, { status: 401 });
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  // Papel e situação vêm do perfil a cada requisição: desativar um aluno vale na hora, sem esperar o token expirar.
  const { data: profile } = await supabase.from("profiles").select("role, active, must_change_password").eq("user_id", user.id).maybeSingle();
  const active = Boolean(profile?.active);
  if (!active) {
    if (isPublic) return response;
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
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|brand/|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff2?)$).*)"],
};
