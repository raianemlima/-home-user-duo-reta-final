import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/content/repository";

// Quantos grifos (e de quantos alunos) dependem de uma versão. Precisa da chave de serviço: os grifos são privados de cada aluno.
export async function versionImpact(admin: SupabaseClient, versionId: string): Promise<{ highlights: number; students: number }> {
  const rows = await readAll<{ id: string; user_id: string }>((from, to) => admin.from("highlights").select("id, user_id").eq("version_id", versionId).order("id").range(from, to), "Falha ao contar os grifos");
  return { highlights: rows.length, students: new Set(rows.map((row) => row.user_id)).size };
}
