import { NextResponse } from "next/server";
import { versionImpact } from "@/lib/content/impact";
import { createAdminClient } from "@/lib/server/admin";
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

// Descarta um rascunho, ou exclui o material publicado (os alunos deixam de ver a disciplina até a próxima publicação).
// Excluir uma versão publicada ou arquivada apaga também os grifos dos alunos nela, por isso exige ?confirmar=publicado.
export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("equipe.versoes.excluir", async () => {
    const { supabase } = await requireStaff();
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Identificador da versão inválido.");
    const { data, error } = await supabase.from("content_versions").select("status").eq("id", id).maybeSingle();
    if (error) throw new Error(`Falha ao ler a versão: ${error.message}`);
    if (!data) throw new ApiError(404, "not_found", "Versão não encontrada.");
    if (data.status === "draft") {
      const { error: deleteError } = await supabase.from("content_versions").delete().eq("id", id).eq("status", "draft");
      if (deleteError) throw new Error(`Falha ao descartar: ${deleteError.message}`);
      return NextResponse.json({ deleted: true, highlightsRemoved: 0 });
    }
    if (new URL(request.url).searchParams.get("confirmar") !== "publicado") throw new ApiError(409, "confirmation_required", "Confirme a exclusão do material publicado: os grifos dos alunos nesta versão serão apagados.");
    // Os grifos são de cada aluno (a equipe não os enxerga pela RLS): a remoção usa a chave de serviço, depois de conferir a equipe.
    const admin = createAdminClient();
    const { highlights } = await versionImpact(admin, id);
    for (const table of ["highlights", "paragraphs", "sections"] as const) {
      const { error: cleanupError } = await admin.from(table).delete().eq("version_id", id);
      if (cleanupError) throw new Error(`Falha ao excluir ${table}: ${cleanupError.message}`);
    }
    const { error: deleteError } = await admin.from("content_versions").delete().eq("id", id);
    if (deleteError) throw new Error(`Falha ao excluir a versão: ${deleteError.message}`);
    return NextResponse.json({ deleted: true, highlightsRemoved: highlights });
  });
}
