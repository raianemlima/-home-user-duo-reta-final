import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/content/repository";
import type { HighlightColor } from "@/lib/highlights/types";

export const ORPHAN_TOPIC = "Trechos alterados na atualização";

export type NotebookItem = { id: string; quote: string; note: string | null; color: HighlightColor; reviewed: boolean; orphaned: boolean; orphanedAt: string | null; disciplineSlug: string; disciplineTitle: string; sectionId: string | null; paragraphId: string | null; sectionPath: string[]; order: [number, number, number] };
export type NotebookFilter = { disciplines?: string[]; colors?: HighlightColor[]; reviewed?: "all" | "pending" | "done" };
export type NotebookGroup = { discipline: { slug: string; title: string }; topics: { path: string[]; items: NotebookItem[] }[] };

type Row = { id: string; discipline_id: string; start_paragraph_id: string; start_offset: number; quote: string; note: string | null; color: HighlightColor; status: string; orphaned_at: string | null; reviewed_at: string | null };
const CHUNK = 300;

async function byIds<T>(supabase: SupabaseClient, table: string, columns: string, ids: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase.from(table).select(columns).in("id", ids.slice(i, i + CHUNK));
    if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

// Caderno do aluno: grifos por disciplina → seção, na ordem do material; órfãos no fim de cada disciplina.
export async function loadNotebook(supabase: SupabaseClient, userId: string, filter: NotebookFilter): Promise<NotebookGroup[]> {
  const { data: disciplines, error } = await supabase.from("disciplines").select("id, slug, title, position").order("position");
  if (error) throw new Error(`Falha ao ler disciplinas: ${error.message}`);
  const wanted = (disciplines ?? []).filter((discipline) => !filter.disciplines?.length || filter.disciplines.includes(discipline.slug));
  const highlights = (await readAll<Row>((from, to) => supabase.from("highlights").select("id, discipline_id, start_paragraph_id, start_offset, quote, note, color, status, orphaned_at, reviewed_at").eq("user_id", userId).order("id").range(from, to), "Falha ao ler o caderno"))
    .filter((row) => wanted.some((discipline) => discipline.id === row.discipline_id))
    .filter((row) => !filter.colors?.length || filter.colors.includes(row.color))
    .filter((row) => (filter.reviewed === "done" ? Boolean(row.reviewed_at) : filter.reviewed === "pending" ? !row.reviewed_at : true));

  const active = highlights.filter((row) => row.status === "active");
  const paragraphs = await byIds<{ id: string; section_id: string; position: number }>(supabase, "paragraphs", "id, section_id, position", [...new Set(active.map((row) => row.start_paragraph_id))]);
  const paragraphOf = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph]));
  const sections = await byIds<{ id: string; title: string | null; path: string[] | null; position: number }>(supabase, "sections", "id, title, path, position", [...new Set(paragraphs.map((paragraph) => paragraph.section_id))]);
  const sectionOf = new Map(sections.map((section) => [section.id, section]));

  return wanted.flatMap((discipline) => {
    const items: NotebookItem[] = highlights.filter((row) => row.discipline_id === discipline.id).map((row): NotebookItem => {
      const paragraph = row.status === "active" ? paragraphOf.get(row.start_paragraph_id) : undefined;
      const section = paragraph ? sectionOf.get(paragraph.section_id) : undefined;
      const orphaned = !section;
      return { id: row.id, quote: row.quote, note: row.note, color: row.color, reviewed: Boolean(row.reviewed_at), orphaned, orphanedAt: row.orphaned_at, disciplineSlug: discipline.slug, disciplineTitle: discipline.title, sectionId: section?.id ?? null, paragraphId: section ? row.start_paragraph_id : null, sectionPath: section ? [...(section.path ?? []), section.title ?? "Introdução"] : [ORPHAN_TOPIC], order: [discipline.position as number, section ? section.position : Number.MAX_SAFE_INTEGER, section ? (paragraph?.position ?? 0) * 1_000_000 + row.start_offset : 0] };
    }).sort((a, b) => a.order[1] - b.order[1] || a.order[2] - b.order[2]);
    if (!items.length) return [];
    const topics: NotebookGroup["topics"] = [];
    for (const item of items) {
      const key = item.sectionPath.join(" › ");
      const last = topics[topics.length - 1];
      if (last && last.path.join(" › ") === key) last.items.push(item); else topics.push({ path: item.sectionPath, items: [item] });
    }
    return [{ discipline: { slug: discipline.slug, title: discipline.title }, topics }];
  });
}
