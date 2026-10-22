import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { draftToVersionText } from "@/lib/content/build";
import type { VersionText } from "@/lib/highlights/types";

export type HighlightView = { id: string; versionId: string; start: { paragraphId: string; offset: number }; end: { paragraphId: string; offset: number }; quote: string; color: string; note: string | null; reviewed: boolean; status: string };

export const HIGHLIGHT_COLUMNS = "id, version_id, start_paragraph_id, start_offset, end_paragraph_id, end_offset, quote, color, note, reviewed_at, status";

export function toHighlightView(row: Record<string, unknown>): HighlightView {
  return { id: row.id as string, versionId: row.version_id as string, start: { paragraphId: row.start_paragraph_id as string, offset: row.start_offset as number }, end: { paragraphId: row.end_paragraph_id as string, offset: row.end_offset as number }, quote: row.quote as string, color: row.color as string, note: (row.note as string | null) ?? null, reviewed: Boolean(row.reviewed_at), status: row.status as string };
}

// Texto da seção onde o grifo começa (o grifo nunca sai da seção). O contexto da âncora fica limitado à seção.
export async function sectionTextOf(supabase: SupabaseClient, versionId: string, paragraphId: string): Promise<{ doc: VersionText; disciplineId: string } | null> {
  const { data: version } = await supabase.from("content_versions").select("id, discipline_id, status").eq("id", versionId).maybeSingle();
  if (!version || version.status !== "published") return null;
  const { data: paragraph } = await supabase.from("paragraphs").select("section_id").eq("id", paragraphId).eq("version_id", versionId).maybeSingle();
  if (!paragraph) return null;
  const { data: section } = await supabase.from("sections").select("id, title, path").eq("id", paragraph.section_id).maybeSingle();
  const { data: paragraphs, error } = await supabase.from("paragraphs").select("id, position, text, hash").eq("section_id", paragraph.section_id).order("position");
  if (error) throw new Error(`Falha ao ler a seção: ${error.message}`);
  if (!section) return null;
  const ordered = ((paragraphs ?? []) as { id: string; position: number; text: string; hash: string }[]).sort((a, b) => a.position - b.position);
  return { doc: draftToVersionText([{ id: section.id, title: section.title, path: section.path ?? [], paragraphs: ordered }]), disciplineId: version.discipline_id };
}
