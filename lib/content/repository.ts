import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { draftToVersionText, type DraftSection } from "@/lib/content/build";
import { reanchor } from "@/lib/highlights/reanchor";
import type { VersionText } from "@/lib/highlights/types";

const PAGE = 1000;
const CHUNK = 500;

function check(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

// O PostgREST devolve no máximo ~1000 linhas por chamada: lê em páginas até acabar.
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, context: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    check(error, context);
    const batch = (data as T[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

async function insertChunks(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
    check(error, `Falha ao gravar ${table}`);
  }
}

export async function saveDraft(supabase: SupabaseClient, input: { disciplineId: string; label: string; sourceSha256: string; sourcePath?: string | null; sourceFileName?: string | null; jobId: string; sections: DraftSection[] }): Promise<{ versionId: string }> {
  const versionId = randomUUID();
  const { error } = await supabase.from("content_versions").insert({ id: versionId, discipline_id: input.disciplineId, label: input.label, source_sha256: input.sourceSha256, source_path: input.sourcePath ?? null, source_file_name: input.sourceFileName ?? null, job_id: input.jobId, status: "draft" });
  check(error, "Falha ao criar a versão");
  const sections = input.sections.map((section) => ({ ...section, id: randomUUID() }));
  try {
    await insertChunks(supabase, "sections", sections.map((section) => ({ id: section.id, version_id: versionId, position: section.position, level: section.level, numbering: section.numbering, title: section.title, path: section.path })));
    await insertChunks(supabase, "paragraphs", sections.flatMap((section) => section.paragraphs.map((paragraph) => ({ section_id: section.id, version_id: versionId, position: paragraph.position, kind: paragraph.kind, text: paragraph.text, hash: paragraph.hash }))));
  } catch (failure) {
    await supabase.from("content_versions").delete().eq("id", versionId);
    throw failure;
  }
  return { versionId };
}

type SectionRow = { id: string; position: number; title: string | null; path: string[] };
type ParagraphRow = { id: string; section_id: string; position: number; text: string; hash: string };

export async function loadVersionText(supabase: SupabaseClient, versionId: string): Promise<VersionText> {
  const sections = await readAll<SectionRow>((from, to) => supabase.from("sections").select("id, position, title, path").eq("version_id", versionId).order("position").range(from, to), "Falha ao ler as seções");
  const paragraphs = await readAll<ParagraphRow>((from, to) => supabase.from("paragraphs").select("id, section_id, position, text, hash").eq("version_id", versionId).order("id").range(from, to), "Falha ao ler os parágrafos");
  const bySection = new Map<string, ParagraphRow[]>();
  for (const paragraph of paragraphs) bySection.set(paragraph.section_id, [...(bySection.get(paragraph.section_id) ?? []), paragraph]);
  return draftToVersionText(sections.sort((a, b) => a.position - b.position).map((section) => ({ ...section, path: section.path ?? [], paragraphs: (bySection.get(section.id) ?? []).sort((a, b) => a.position - b.position) })));
}

type HighlightRow = Record<string, unknown> & { id: string; start_paragraph_id: string; start_offset: number; end_paragraph_id: string; end_offset: number; quote: string; prefix: string; suffix: string };

// Publica um rascunho. Idempotente: se já está publicado (clique duplo, duas abas), nada mais roda.
export async function publishVersion(admin: SupabaseClient, versionId: string): Promise<{ published: true; alreadyPublished: boolean; reanchored: number; orphaned: number }> {
  const { data: version, error } = await admin.from("content_versions").select("id, discipline_id, status").eq("id", versionId).maybeSingle();
  check(error, "Falha ao ler a versão");
  if (!version) throw new Error("Versão não encontrada.");
  if (version.status === "published") return { published: true, alreadyPublished: true, reanchored: 0, orphaned: 0 };
  if (version.status !== "draft") throw new Error("Só rascunhos podem ser publicados.");

  const { data: previous, error: previousError } = await admin.from("content_versions").select("id").eq("discipline_id", version.discipline_id).eq("status", "published").neq("id", versionId).maybeSingle();
  check(previousError, "Falha ao localizar a versão publicada");
  if (previous) check((await admin.from("content_versions").update({ status: "archived" }).eq("id", previous.id).eq("status", "published")).error, "Falha ao arquivar a versão anterior");
  const { data: promoted, error: promoteError } = await admin.from("content_versions").update({ status: "published", published_at: new Date().toISOString() }).eq("id", versionId).eq("status", "draft").select("id");
  check(promoteError, "Falha ao publicar");
  if (!(promoted as unknown[] | null)?.length) return { published: true, alreadyPublished: true, reanchored: 0, orphaned: 0 };
  if (!previous) return { published: true, alreadyPublished: false, reanchored: 0, orphaned: 0 };

  const highlights = await readAll<HighlightRow>((from, to) => admin.from("highlights").select("*").eq("version_id", previous.id).eq("status", "active").order("id").range(from, to), "Falha ao ler os grifos");
  if (!highlights.length) return { published: true, alreadyPublished: false, reanchored: 0, orphaned: 0 };
  const [oldDoc, newDoc] = await Promise.all([loadVersionText(admin, previous.id), loadVersionText(admin, versionId)]);
  const results = reanchor(highlights.map((row) => ({ id: row.id, anchor: { start: { paragraphId: row.start_paragraph_id, offset: row.start_offset }, end: { paragraphId: row.end_paragraph_id, offset: row.end_offset }, quote: row.quote, prefix: row.prefix, suffix: row.suffix } })), oldDoc, newDoc);
  const now = new Date().toISOString();
  const byId = new Map(highlights.map((row) => [row.id, row]));
  const updated = results.map((result) => {
    const row = byId.get(result.highlightId) as HighlightRow;
    if (result.status === "orphaned") return { ...row, status: "orphaned", orphaned_at: now };
    const { anchor } = result;
    return { ...row, version_id: versionId, start_paragraph_id: anchor.start.paragraphId, start_offset: anchor.start.offset, end_paragraph_id: anchor.end.paragraphId, end_offset: anchor.end.offset, prefix: anchor.prefix, suffix: anchor.suffix };
  });
  for (let i = 0; i < updated.length; i += CHUNK) check((await admin.from("highlights").upsert(updated.slice(i, i + CHUNK), { onConflict: "id" })).error, "Falha ao gravar os grifos reancorados");
  const orphaned = results.filter((result) => result.status === "orphaned").length;
  return { published: true, alreadyPublished: false, reanchored: results.length - orphaned, orphaned };
}
