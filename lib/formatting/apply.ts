import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/content/repository";
import { formatParagraphs } from "@/lib/formatting/align";
import { extractStyledLines } from "@/lib/formatting/pdf-styles";
import type { ParagraphFormat } from "@/lib/formatting/types";
import { createAdminClient } from "@/lib/server/admin";

export type FormattingResult = { formatted: number; matched: number; total: number; skipped?: "not_pdf" | "no_source" };

export class FormattingUnavailable extends Error {}

// Lê o PDF original da versão, encaixa a formatação nos parágrafos e grava tudo numa chamada (set_paragraph_formats).
// `supabase` é a sessão da equipe (o RLS só deixa a equipe alterar parágrafos); o arquivo é lido com a chave de serviço.
export async function applyFormatting(supabase: SupabaseClient, versionId: string): Promise<FormattingResult> {
  const { data: version, error } = await supabase.from("content_versions").select("id, source_path").eq("id", versionId).maybeSingle();
  if (error) throw new Error(`Falha ao ler a versão: ${error.message}`);
  if (!version) throw new Error("Versão não encontrada.");
  const sections = await readAll<{ id: string; position: number }>((from, to) => supabase.from("sections").select("id, position").eq("version_id", versionId).order("position").range(from, to), "Falha ao ler as seções");
  const rows = await readAll<{ id: string; section_id: string; position: number; kind: string; text: string }>((from, to) => supabase.from("paragraphs").select("id, section_id, position, kind, text").eq("version_id", versionId).order("id").range(from, to), "Falha ao ler os parágrafos");
  const order = new Map(sections.map((section) => [section.id, section.position]));
  const paragraphs = rows.sort((a, b) => (order.get(a.section_id) ?? 0) - (order.get(b.section_id) ?? 0) || a.position - b.position);
  if (!version.source_path) return { formatted: 0, matched: 0, total: paragraphs.length, skipped: "no_source" };
  if (!/\.pdf$/i.test(version.source_path)) return { formatted: 0, matched: 0, total: paragraphs.length, skipped: "not_pdf" };
  const file = await createAdminClient().storage.from("documents").download(version.source_path);
  if (file.error || !file.data) throw new Error(`Falha ao ler o PDF original: ${file.error?.message ?? "vazio"}`);
  const doc = await extractStyledLines(new Uint8Array(await file.data.arrayBuffer()));
  const { formats, matched } = formatParagraphs(paragraphs, doc);
  const payload: Record<string, ParagraphFormat> = Object.fromEntries(formats);
  const { error: saveError } = await supabase.rpc("set_paragraph_formats", { p_version_id: versionId, p_formats: payload });
  if (saveError) {
    if (saveError.code === "PGRST202" || /set_paragraph_formats/.test(saveError.message)) throw new FormattingUnavailable("Aplique a migração 0023 (formatação do PDF) no Supabase antes de usar este botão.");
    throw new Error(`Falha ao gravar a formatação: ${saveError.message}`);
  }
  return { formatted: formats.size, matched, total: paragraphs.length };
}
