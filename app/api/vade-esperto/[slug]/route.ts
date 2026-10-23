import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute } from "@/lib/server/http";
import { deliverProtectedPdf } from "@/lib/server/protected-download";
import { VADE_BUCKET, vadeMaterial } from "@/lib/vade";

export const dynamic = "force-dynamic";

// Abre o PDF do Vade Esperto (protegido para o aluno) por URL assinada de vida curta; com ?baixar=1, baixa o arquivo.
export function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handleRoute("vade.abrir", async () => {
    const { supabase, user } = await requireStudent();
    const { slug } = await context.params;
    const material = vadeMaterial(slug);
    if (!material) throw new ApiError(404, "not_found", "Vade Esperto não encontrado.");
    const { data, error } = await supabase.from("vade_esperto").select("slug").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`Falha ao ler o Vade Esperto: ${error.message}`);
    if (!data) throw new ApiError(404, "not_found", "Este Vade Esperto ainda não foi publicado.");
    // Aberto no navegador ou baixado: sempre o PDF protegido (identificado e sem cópia), nunca o arquivo original.
    const inline = !new URL(request.url).searchParams.has("baixar");
    return deliverProtectedPdf({ bucket: VADE_BUCKET, path: `${slug}.pdf`, fileName: `Vade Esperto - ${material.titulo}.pdf`, key: `vade-${slug}`, user, inline });
  });
}
