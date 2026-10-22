import "server-only";
import { redirect } from "next/navigation";
import { identityFromRequest } from "@/lib/server/identity";
import { createClient } from "@/lib/supabase/server";

// Páginas do aluno: o proxy já barrou quem não tem sessão ativa; aqui só obtemos o cliente e o id.
export async function studentSession() {
  const supabase = await createClient();
  const identity = await identityFromRequest();
  if (identity) return { supabase, userId: identity.id };
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, userId: data.user.id };
}
