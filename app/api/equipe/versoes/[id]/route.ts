import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute } from "@/lib/server/http";
import { readAll } from "@/lib/content/repository";
import { loadToc } from "@/lib/reader/queries";

export const dynamic = "force-dynamic";
const SAMPLE_SECTIONS = 3, SAMPLE_PARAGRAPHS = 2;

// Prévia de um rascunho para a equipe conferir antes de publicar: sumário, contagens e o começo das primeiras seções.
export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("equipe.versoes.previa", async () => {
    const { supabase } = await requireStaff();
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Identificador da versão inválido.");
    const { data: version } = await supabase.from("content_versions").select("id, label, status").eq("id", id).maybeSingle();
    if (!version) throw new ApiError(404, "not_found", "Versão não encontrada.");
    const toc = await loadToc(supabase, id);
    const rows = await readAll<{ kind: string }>((from, to) => supabase.from("paragraphs").select("kind").eq("version_id", id).order("id").range(from, to), "Falha ao contar parágrafos");
    const sample = await Promise.all(toc.slice(0, SAMPLE_SECTIONS).map(async (section) => {
      const { data } = await supabase.from("paragraphs").select("text, position").eq("section_id", section.id).order("position").limit(SAMPLE_PARAGRAPHS);
      return { ...section, paragraphs: ((data ?? []) as { text: string }[]).map((paragraph) => paragraph.text) };
    }));
    return NextResponse.json({ version, toc, stats: { sections: toc.length, paragraphs: rows.length, tips: rows.filter((row) => row.kind === "tip").length }, sample });
  });
}

// Descarta um rascunho. Versões publicadas ou arquivadas são o histórico dos grifos e nunca são apagadas.
export function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("equipe.versoes.descartar", async () => {
    const { supabase } = await requireStaff();
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Identificador da versão inválido.");
    const { data, error } = await supabase.from("content_versions").select("status").eq("id", id).maybeSingle();
    if (error) throw new Error(`Falha ao ler a versão: ${error.message}`);
    if (!data) throw new ApiError(404, "not_found", "Versão não encontrada.");
    if (data.status !== "draft") throw new ApiError(409, "conflict", "Só rascunhos podem ser descartados.");
    const { error: deleteError } = await supabase.from("content_versions").delete().eq("id", id).eq("status", "draft");
    if (deleteError) throw new Error(`Falha ao descartar: ${deleteError.message}`);
    return NextResponse.json({ deleted: true });
  });
}
