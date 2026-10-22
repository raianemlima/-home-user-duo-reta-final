import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStaff } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute } from "@/lib/server/http";
import { isVadeDiscipline } from "@/lib/vade";

export const dynamic = "force-dynamic";

// Exclui uma disciplina cadastrada por engano ou que não será mais usada, com os rascunhos dela.
// Disciplina com material publicado não sai por aqui: antes, exclua o publicado (que mostra quantos grifos dos alunos serão apagados).
export function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("equipe.disciplinas.excluir", async () => {
    const { supabase } = await requireStaff();
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Identificador da disciplina inválido.");
    const { data: discipline, error } = await supabase.from("disciplines").select("id, slug").eq("id", id).maybeSingle();
    if (error) throw new Error(`Falha ao ler a disciplina: ${error.message}`);
    if (!discipline) throw new ApiError(404, "not_found", "Disciplina não encontrada.");
    if (isVadeDiscipline(discipline.slug as string)) throw new ApiError(409, "conflict", "O leitor do Vade Esperto faz parte da plataforma e não pode ser excluído. Exclua só o material publicado, se precisar.");
    const { data: versions, error: versionError } = await supabase.from("content_versions").select("id, status").eq("discipline_id", id);
    if (versionError) throw new Error(`Falha ao ler as versões: ${versionError.message}`);
    const rows = (versions ?? []) as { id: string; status: string }[];
    if (rows.some((version) => version.status !== "draft")) throw new ApiError(409, "conflict", "Esta disciplina tem material publicado. Exclua o material publicado primeiro.");
    // Rascunhos não têm grifos de alunos; a limpeza explícita (além do cascade) usa a chave de serviço, depois de conferir a equipe.
    const admin = createAdminClient();
    for (const version of rows) {
      for (const table of ["highlights", "paragraphs", "sections"] as const) {
        const { error: cleanupError } = await admin.from(table).delete().eq("version_id", version.id);
        if (cleanupError) throw new Error(`Falha ao excluir ${table}: ${cleanupError.message}`);
      }
    }
    for (const table of ["reading_positions", "content_versions"] as const) {
      const { error: cleanupError } = await admin.from(table).delete().eq("discipline_id", id);
      if (cleanupError) throw new Error(`Falha ao excluir ${table}: ${cleanupError.message}`);
    }
    const { error: deleteError } = await admin.from("disciplines").delete().eq("id", id);
    if (deleteError) throw new Error(`Falha ao excluir a disciplina: ${deleteError.message}`);
    return NextResponse.json({ deleted: true, draftsRemoved: rows.length });
  });
}
