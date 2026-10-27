import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute } from "@/lib/server/http";
import { deliverProtectedPdf } from "@/lib/server/protected-download";
import { isVadeDiscipline, VADE_BUCKET, vadeMaterial, vadeOfDiscipline } from "@/lib/vade";

export const dynamic = "force-dynamic";

// PDF original da versão publicada, protegido para o aluno (marca com o e-mail + criptografia sem cópia).
export function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handleRoute("disciplinas.original", async () => {
    const { supabase, user } = await requireStudent();
    const { slug } = await context.params;
    const { data: discipline, error } = await supabase.from("disciplines").select("id, title").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`Falha ao ler a disciplina: ${error.message}`);
    if (!discipline) throw new ApiError(404, "not_found", "Disciplina não encontrada.");
    // Leitor do Vade Esperto (importado do Word): o "PDF original" é o PDF do Vade Esperto, não o arquivo Word.
    // A matéria vem do título, como na página Vade Esperto ("Vade Esperto – Código de Processo Penal" → processo-penal):
    // o endereço criado a partir do título ("vade-esperto-codigo-de-processo-penal") quase nunca é o da matéria.
    const vade = isVadeDiscipline(slug) ? vadeMaterial(vadeOfDiscipline(discipline.title) ?? slug.replace(/^vade-esperto-/, "")) : null;
    if (vade) {
      const { data: published, error: vadeError } = await supabase.from("vade_esperto").select("slug").eq("slug", vade.slug).maybeSingle();
      if (vadeError) throw new Error(`Falha ao ler o Vade Esperto: ${vadeError.message}`);
      if (!published) throw new ApiError(404, "not_found", "O PDF deste Vade Esperto ainda não foi publicado.");
      return deliverProtectedPdf({ bucket: VADE_BUCKET, path: `${vade.slug}.pdf`, fileName: `Vade Esperto - ${vade.titulo}.pdf`, key: `vade-${vade.slug}`, user });
    }
    const { data: version, error: versionError } = await supabase.from("content_versions").select("source_path, source_file_name").eq("discipline_id", discipline.id).eq("status", "published").maybeSingle();
    if (versionError) throw new Error(`Falha ao ler a versão: ${versionError.message}`);
    if (!version?.source_path || !/\.pdf$/i.test(version.source_path)) throw new ApiError(404, "not_found", "O PDF original desta disciplina não está disponível.");
    return deliverProtectedPdf({ bucket: "documents", path: version.source_path, fileName: version.source_file_name ?? `${discipline.title}.pdf`, key: `ebook-${slug}`, user });
  });
}
