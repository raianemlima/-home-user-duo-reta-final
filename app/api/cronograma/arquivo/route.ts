import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStudent } from "@/lib/server/auth";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/server/documents";
import { ApiError, handleRoute } from "@/lib/server/http";
import { ownPlanFiles } from "@/lib/server/study-plan-files";
import { STUDY_PLAN_BUCKET } from "@/lib/study-plan";

export const dynamic = "force-dynamic";

// Abre o cronograma do próprio aluno por uma URL assinada de vida curta.
export function GET() {
  return handleRoute("cronograma.abrir", async () => {
    const { user } = await requireStudent();
    const [file] = await ownPlanFiles(user.id);
    if (!file) throw new ApiError(404, "not_found", "Você ainda não enviou um cronograma.");
    const signed = await createAdminClient().storage.from(STUDY_PLAN_BUCKET).createSignedUrl(file.path, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data) throw new Error(`Falha ao assinar a URL: ${signed.error?.message ?? "resposta vazia"}`);
    return NextResponse.redirect(signed.data.signedUrl, 302);
  });
}
