import { after, NextResponse } from "next/server";
import { publishVersion } from "@/lib/content/repository";
import { notifyStudents } from "@/lib/push/send";
import { createAdminClient } from "@/lib/server/admin";
import { requireStaff } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// A reancoragem mexe nos grifos de todos os alunos: roda com a chave de serviço, depois de conferir que quem pede é da equipe.
export function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("equipe.versoes.publicar", async () => {
    const { supabase } = await requireStaff();
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Identificador da versão inválido.");
    const { data } = await supabase.from("content_versions").select("id, label, discipline_id").eq("id", id).maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "Versão não encontrada.");
    const admin = createAdminClient();
    const result = await publishVersion(admin, id);
    if (!result.alreadyPublished) {
      const { data: discipline } = await supabase.from("disciplines").select("slug, title").eq("id", data.discipline_id).maybeSingle();
      // Avisos depois da resposta: com muitos aparelhos inscritos, a tela de publicação não fica esperando o envio.
      after(() => notifyStudents(admin, { title: "Material novo no app DUO", body: `${discipline?.title ?? "Um material"} foi atualizado: ${data.label}. Toque para ler e baixar o PDF.`, url: discipline ? `/disciplinas/${discipline.slug}` : "/" }));
    }
    return NextResponse.json(result);
  });
}
