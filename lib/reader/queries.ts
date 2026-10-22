import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/content/repository";

export type DisciplineCard = { id: string; slug: string; title: string; versionId: string; versionLabel: string; publishedAt: string; updatedSinceLastVisit: boolean; lastSectionId: string | null };
export type TocItem = { id: string; level: number; numbering: string | null; title: string | null; path: string[] };
export type Toc = TocItem[];
export type ReaderParagraph = { id: string; kind: "body" | "table" | "footnote" | "tip"; text: string };
export type SectionView = { discipline: { id: string; slug: string; title: string }; versionId: string; versionLabel: string; hasOriginal: boolean; toc: Toc; section: { id: string; numbering: string | null; title: string | null; path: string[]; paragraphs: ReaderParagraph[] }; prevId: string | null; nextId: string | null };

function check(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function listDisciplines(supabase: SupabaseClient, userId: string): Promise<DisciplineCard[]> {
  const { data: disciplines, error } = await supabase.from("disciplines").select("id, slug, title, position").order("position");
  check(error, "Falha ao listar disciplinas");
  const { data: versions, error: versionError } = await supabase.from("content_versions").select("id, discipline_id, label, published_at").eq("status", "published");
  check(versionError, "Falha ao listar versões");
  const { data: positions, error: positionError } = await supabase.from("reading_positions").select("discipline_id, section_id, updated_at").eq("user_id", userId);
  check(positionError, "Falha ao ler a posição de leitura");
  const versionOf = new Map((versions ?? []).map((version) => [version.discipline_id as string, version]));
  const positionOf = new Map((positions ?? []).map((position) => [position.discipline_id as string, position]));
  const sectionIds = (positions ?? []).map((position) => position.section_id as string);
  const { data: validSections } = sectionIds.length ? await supabase.from("sections").select("id, version_id").in("id", sectionIds) : { data: [] };
  const sectionVersion = new Map((validSections ?? []).map((section) => [section.id as string, section.version_id as string]));
  return (disciplines ?? []).flatMap((discipline) => {
    const version = versionOf.get(discipline.id);
    if (!version) return [];
    const position = positionOf.get(discipline.id);
    const lastSectionId = position && sectionVersion.get(position.section_id) === version.id ? (position.section_id as string) : null;
    return [{ id: discipline.id, slug: discipline.slug, title: discipline.title, versionId: version.id, versionLabel: version.label, publishedAt: version.published_at, updatedSinceLastVisit: Boolean(position && version.published_at && position.updated_at < version.published_at), lastSectionId }];
  });
}

async function publishedVersion(supabase: SupabaseClient, slug: string) {
  const { data: discipline, error } = await supabase.from("disciplines").select("id, slug, title").eq("slug", slug).maybeSingle();
  check(error, "Falha ao ler a disciplina");
  if (!discipline) return null;
  const { data: version, error: versionError } = await supabase.from("content_versions").select("id, label, source_path").eq("discipline_id", discipline.id).eq("status", "published").maybeSingle();
  check(versionError, "Falha ao ler a versão");
  return version ? { discipline, version } : null;
}

export async function loadToc(supabase: SupabaseClient, versionId: string): Promise<Toc> {
  const rows = await readAll<TocItem & { position: number }>((from, to) => supabase.from("sections").select("id, level, numbering, title, path, position").eq("version_id", versionId).order("position").range(from, to), "Falha ao ler o sumário");
  return rows.sort((a, b) => a.position - b.position).map(({ id, level, numbering, title, path }) => ({ id, level, numbering, title, path: path ?? [] }));
}

// Capítulos sem texto próprio não são seções, mas aparecem no caminho das subseções: o sumário mostra o nome deles.
export function chapterBreaks(toc: Toc): Map<string, string> {
  const titles = new Set(toc.map((item) => item.title));
  const breaks = new Map<string, string>();
  let previous: string | undefined;
  for (const item of toc) {
    const chapter = item.path[0];
    if (chapter && !titles.has(chapter) && chapter !== previous) breaks.set(item.id, chapter);
    previous = chapter;
  }
  return breaks;
}

export async function firstSectionId(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const found = await publishedVersion(supabase, slug);
  if (!found) return null;
  const { data } = await supabase.from("sections").select("id").eq("version_id", found.version.id).order("position").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function loadSection(supabase: SupabaseClient, slug: string, sectionId: string): Promise<SectionView | null> {
  const found = await publishedVersion(supabase, slug);
  if (!found) return null;
  const { data: section, error } = await supabase.from("sections").select("id, numbering, title, path").eq("id", sectionId).eq("version_id", found.version.id).maybeSingle();
  check(error, "Falha ao ler a seção");
  if (!section) return null;
  const { data: paragraphs, error: paragraphError } = await supabase.from("paragraphs").select("id, kind, text, position").eq("section_id", sectionId).order("position");
  check(paragraphError, "Falha ao ler os parágrafos");
  const toc = await loadToc(supabase, found.version.id);
  const index = toc.findIndex((item) => item.id === sectionId);
  return {
    discipline: found.discipline, versionId: found.version.id, versionLabel: found.version.label, hasOriginal: Boolean(found.version.source_path), toc,
    section: { id: section.id, numbering: section.numbering, title: section.title, path: section.path ?? [], paragraphs: ((paragraphs ?? []) as (ReaderParagraph & { position: number })[]).sort((a, b) => a.position - b.position).map(({ id, kind, text }) => ({ id, kind, text })) },
    prevId: index > 0 ? toc[index - 1].id : null, nextId: index >= 0 && index < toc.length - 1 ? toc[index + 1].id : null,
  };
}

export const MIN_SEARCH_CHARS = 3;
const MAX_RESULTS = 30;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

function snippet(text: string, query: string): string {
  const at = text.toLocaleLowerCase("pt-BR").indexOf(query.toLocaleLowerCase("pt-BR"));
  const from = Math.max(0, at - 60), to = Math.min(text.length, (at < 0 ? 0 : at) + query.length + 80);
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}

export async function searchDiscipline(supabase: SupabaseClient, slug: string, q: string): Promise<{ sectionId: string; sectionTitle: string | null; snippet: string }[]> {
  const query = q.trim().replace(/\s+/g, " ");
  if (query.length < MIN_SEARCH_CHARS) return [];
  const found = await publishedVersion(supabase, slug);
  if (!found) return [];
  const { data, error } = await supabase.from("paragraphs").select("section_id, text").eq("version_id", found.version.id).ilike("text", `%${escapeLike(query.slice(0, 100))}%`).limit(MAX_RESULTS);
  check(error, "Falha na busca");
  const hits = (data ?? []) as { section_id: string; text: string }[];
  const sectionIds = [...new Set(hits.map((hit) => hit.section_id))];
  const { data: sections } = sectionIds.length ? await supabase.from("sections").select("id, title, position").in("id", sectionIds) : { data: [] };
  const sectionOf = new Map((sections ?? []).map((section) => [section.id as string, section]));
  return hits
    .sort((a, b) => ((sectionOf.get(a.section_id)?.position as number) ?? 0) - ((sectionOf.get(b.section_id)?.position as number) ?? 0))
    .map((hit) => ({ sectionId: hit.section_id, sectionTitle: (sectionOf.get(hit.section_id)?.title as string | null | undefined) ?? null, snippet: snippet(hit.text, query) }));
}
