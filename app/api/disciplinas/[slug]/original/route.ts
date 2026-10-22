import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStudent } from "@/lib/server/auth";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/server/documents";
import { ApiError, handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// PDF original da versão publicada. O bucket é só da equipe: o aluno recebe uma URL assinada de vida curta, gerada aqui.
export function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handleRoute("disciplinas.original", async () => {
    const { supabase } = await requireStudent();
    const { slug } = await context.params;
    const { data: discipline, error } = await supabase.from("disciplines").select("id").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`Falha ao ler a disciplina: ${error.message}`);
    if (!discipline) throw new ApiError(404, "not_found", "Disciplina não encontrada.");
    const { data: version, error: versionError } = await supabase.from("content_versions").select("source_path, source_file_name").eq("discipline_id", discipline.id).eq("status", "published").maybeSingle();
    if (versionError) throw new Error(`Falha ao ler a versão: ${versionError.message}`);
    if (!version?.source_path) throw new ApiError(404, "not_found", "O PDF original desta disciplina não está disponível.");
    const signed = await createAdminClient().storage.from("documents").createSignedUrl(version.source_path, SIGNED_URL_TTL_SECONDS, { download: version.source_file_name ?? true });
    if (signed.error || !signed.data) throw new Error(`Falha ao assinar a URL: ${signed.error?.message ?? "resposta vazia"}`);
    return NextResponse.redirect(signed.data.signedUrl, 302);
  });
}
