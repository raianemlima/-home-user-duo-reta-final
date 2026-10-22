import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/server/http";

export type Profile = { role: "equipe" | "aluno"; active: boolean };

// Retorna o cliente atrelado à sessão do usuário (RLS ativa) e o usuário autenticado, ou lança 401.
export async function requireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
  return { supabase, user: data.user };
}

async function loadProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("role, active").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Falha ao carregar o perfil: ${error.message}`);
  return data ? { role: data.role, active: data.active } : null;
}

// Aluno ativo (ou equipe ativa). Sem perfil ou desativado: 403, mesmo com sessão válida.
export async function requireStudent(): Promise<{ supabase: SupabaseClient; user: User; profile: Profile }> {
  const { supabase, user } = await requireUser();
  const profile = await loadProfile(supabase, user.id);
  if (!profile || !profile.active) throw new ApiError(403, "forbidden", "Seu acesso ao curso não está ativo. Fale com a equipe do Cursos DUO.");
  return { supabase, user, profile };
}

export async function requireStaff(): Promise<{ supabase: SupabaseClient; user: User }> {
  const { supabase, user, profile } = await requireStudent().catch((error: unknown) => { throw error instanceof ApiError && error.status === 403 ? new ApiError(403, "forbidden", "Acesso restrito à equipe.") : error; });
  if (profile.role !== "equipe") throw new ApiError(403, "forbidden", "Acesso restrito à equipe.");
  return { supabase, user };
}
