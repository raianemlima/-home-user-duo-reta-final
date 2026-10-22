import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isVadeDiscipline, VADE_MATERIALS, vadeOfDiscipline } from "@/lib/vade";

export type VadeEntry = { slug: string; titulo: string; versao: string; atualizadoEm: string | null; disponivel: boolean; leitor: string | null };

// Vade Espertos publicados no leitor: matéria → slug da disciplina ("processo-penal" → "vade-esperto-cpp").
export async function vadeReaders(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data: disciplines, error } = await supabase.from("disciplines").select("id, slug, title").like("slug", "vade-esperto%");
  if (error) throw new Error(`Falha ao ler o Vade Esperto no leitor: ${error.message}`);
  const found = (disciplines ?? []).filter((discipline: { slug: string }) => isVadeDiscipline(discipline.slug));
  if (!found.length) return new Map();
  const { data: versions, error: versionError } = await supabase.from("content_versions").select("discipline_id").eq("status", "published").in("discipline_id", found.map((discipline: { id: string }) => discipline.id));
  if (versionError) throw new Error(`Falha ao ler as versões do Vade Esperto: ${versionError.message}`);
  const published = new Set((versions ?? []).map((version: { discipline_id: string }) => version.discipline_id));
  const readers = new Map<string, string>();
  for (const discipline of found as { id: string; slug: string; title: string }[]) {
    const material = vadeOfDiscipline(discipline.title);
    if (material && published.has(discipline.id) && !readers.has(material)) readers.set(material, discipline.slug);
  }
  return readers;
}

// O catálogo com o que a equipe já publicou (a tabela só tem linha para o PDF enviado).
export async function listVade(supabase: SupabaseClient): Promise<VadeEntry[]> {
  const { data, error } = await supabase.from("vade_esperto").select("slug, versao, updated_at");
  if (error) throw new Error(`Falha ao ler o Vade Esperto: ${error.message}`);
  const rows = new Map((data ?? []).map((row: { slug: string; versao: string; updated_at: string }) => [row.slug, row]));
  const readers = await vadeReaders(supabase);
  return VADE_MATERIALS.map((material) => {
    const row = rows.get(material.slug);
    return { slug: material.slug, titulo: material.titulo, versao: row?.versao ?? "", atualizadoEm: row?.updated_at ?? null, disponivel: Boolean(row), leitor: readers.get(material.slug) ?? null };
  });
}
