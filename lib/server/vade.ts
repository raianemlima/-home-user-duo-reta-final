import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VADE_MATERIALS } from "@/lib/vade";

export type VadeEntry = { slug: string; titulo: string; versao: string; atualizadoEm: string | null; disponivel: boolean };

// O catálogo com o que a equipe já publicou (a tabela só tem linha para o PDF enviado).
export async function listVade(supabase: SupabaseClient): Promise<VadeEntry[]> {
  const { data, error } = await supabase.from("vade_esperto").select("slug, versao, updated_at");
  if (error) throw new Error(`Falha ao ler o Vade Esperto: ${error.message}`);
  const rows = new Map((data ?? []).map((row: { slug: string; versao: string; updated_at: string }) => [row.slug, row]));
  return VADE_MATERIALS.map((material) => {
    const row = rows.get(material.slug);
    return { slug: material.slug, titulo: material.titulo, versao: row?.versao ?? "", atualizadoEm: row?.updated_at ?? null, disponivel: Boolean(row) };
  });
}
