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

type HighlightRow = Record<string, unknown> & { id: string; version_id: string; start_paragraph_id: string; start_offset: number; end_paragraph_id: string; end_offset: number; quote: string; prefix: string; suffix: string };
type VersionRow = { id: string; discipline_id: string };

// Arquiva a publicada e publica o rascunho numa transação só (função publish_content_version, migração 0019).
// Banco ainda sem a migração (o deploy chegou antes dela): os mesmos passos em sequência, como antes.
// Devolve false quando outra chamada já publicou a versão.
async function promote(admin: SupabaseClient, version: VersionRow): Promise<boolean> {
  const { data, error } = await admin.rpc("publish_content_version", { p_version_id: version.id });
  if (!error) return Boolean((data as { promoted: boolean }[] | null)?.[0]?.promoted);
  if (error.code !== "PGRST202") throw new Error(/version_not_draft/.test(error.message) ? "Só rascunhos podem ser publicados." : /version_not_found/.test(error.message) ? "Versão não encontrada." : `Falha ao publicar: ${error.message}`);
  console.warn(JSON.stringify({ at: new Date().toISOString(), route: "content.publish", stage: "promote", status: "fallback", detail: "função publish_content_version ausente: aplique a migração 0019" }));
  const { data: previous, error: previousError } = await admin.from("content_versions").select("id").eq("discipline_id", version.discipline_id).eq("status", "published").neq("id", version.id).maybeSingle();
  check(previousError, "Falha ao localizar a versão publicada");
  if (previous) check((await admin.from("content_versions").update({ status: "archived" }).eq("id", previous.id).eq("status", "published")).error, "Falha ao arquivar a versão anterior");
  const { data: promoted, error: promoteError } = await admin.from("content_versions").update({ status: "published", published_at: new Date().toISOString() }).eq("id", version.id).eq("status", "draft").select("id");
  check(promoteError, "Falha ao publicar");
  return Boolean((promoted as unknown[] | null)?.length);
}

// Leva para a versão publicada os grifos ativos da disciplina que estão em versões anteriores: os da versão que acabou
// de sair e os que uma publicação interrompida no meio da reancoragem tenha deixado para trás.
async function reanchorInto(admin: SupabaseClient, version: VersionRow): Promise<{ reanchored: number; orphaned: number }> {
  const highlights = await readAll<HighlightRow>((from, to) => admin.from("highlights").select("*").eq("discipline_id", version.discipline_id).eq("status", "active").neq("version_id", version.id).order("id").range(from, to), "Falha ao ler os grifos");
  if (!highlights.length) return { reanchored: 0, orphaned: 0 };
  const newDoc = await loadVersionText(admin, version.id);
  const bySource = new Map<string, HighlightRow[]>();
  for (const row of highlights) bySource.set(row.version_id, [...(bySource.get(row.version_id) ?? []), row]);
  const now = new Date().toISOString();
  const updated: Record<string, unknown>[] = [];
  let orphaned = 0;
  for (const [sourceId, rows] of bySource) {
    const results = reanchor(rows.map((row) => ({ id: row.id, anchor: { start: { paragraphId: row.start_paragraph_id, offset: row.start_offset }, end: { paragraphId: row.end_paragraph_id, offset: row.end_offset }, quote: row.quote, prefix: row.prefix, suffix: row.suffix } })), await loadVersionText(admin, sourceId), newDoc);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const result of results) {
      const row = byId.get(result.highlightId) as HighlightRow;
      if (result.status === "orphaned") { orphaned += 1; updated.push({ ...row, status: "orphaned", orphaned_at: now }); continue; }
      const { anchor } = result;
      updated.push({ ...row, version_id: version.id, start_paragraph_id: anchor.start.paragraphId, start_offset: anchor.start.offset, end_paragraph_id: anchor.end.paragraphId, end_offset: anchor.end.offset, prefix: anchor.prefix, suffix: anchor.suffix });
    }
  }
  for (let i = 0; i < updated.length; i += CHUNK) check((await admin.from("highlights").upsert(updated.slice(i, i + CHUNK), { onConflict: "id" })).error, "Falha ao gravar os grifos reancorados");
  return { reanchored: updated.length - orphaned, orphaned };
}

// Publica um rascunho. Idempotente: se já está publicado (clique duplo, duas abas), a versão não muda; só os grifos
// que tenham ficado para trás são levados para ela.
export async function publishVersion(admin: SupabaseClient, versionId: string): Promise<{ published: true; alreadyPublished: boolean; reanchored: number; orphaned: number }> {
  const { data: version, error } = await admin.from("content_versions").select("id, discipline_id, status").eq("id", versionId).maybeSingle();
  check(error, "Falha ao ler a versão");
  if (!version) throw new Error("Versão não encontrada.");
  if (version.status !== "draft" && version.status !== "published") throw new Error("Só rascunhos podem ser publicados.");
  const promoted = version.status === "draft" && (await promote(admin, version as VersionRow));
  return { published: true, alreadyPublished: !promoted, ...(await reanchorInto(admin, version as VersionRow)) };
}
