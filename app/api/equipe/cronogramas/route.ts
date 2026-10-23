import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";
import { isOfficialPlan, MAX_STUDY_PLAN_BYTES, OFFICIAL_PLANS, STUDY_PLAN_BUCKET, STUDY_PLAN_TYPES } from "@/lib/study-plan";

export const dynamic = "force-dynamic";

// Cronogramas oficiais (3h, 4h e 6h por dia): a equipe envia o Word e os alunos que escolherem leem no app.
export function GET() {
  return handleRoute("equipe.cronogramas.listar", async () => {
    await requireStaff();
    const { data, error } = await createAdminClient().storage.from(STUDY_PLAN_BUCKET).list("oficiais", { limit: 20 });
    if (error) throw new Error(`Falha ao listar os cronogramas: ${error.message}`);
    const files = new Map((data ?? []).map((item) => [`oficiais/${item.name}`, item.updated_at ?? item.created_at ?? null]));
    return NextResponse.json({ planos: Object.entries(OFFICIAL_PLANS).map(([key, plan]) => ({ plano: key, label: plan.label, publicado: files.has(plan.path), atualizadoEm: files.get(plan.path) ?? null })) });
  });
}

// Prepara o envio direto do navegador para o armazenamento, substituindo a versão anterior.
export function POST(request: Request) {
  return handleRoute("equipe.cronogramas.enviar", async () => {
    await requireStaff();
    const body = await readJson(request);
    if (!isOfficialPlan(body.plano)) throw new ApiError(400, "invalid_request", "Escolha o cronograma de 3h, de 4h ou de 6h.");
    if (typeof body.fileName !== "string" || !body.fileName.toLowerCase().endsWith(".docx")) throw new ApiError(400, "invalid_request", "Envie o cronograma em Word (.docx), para os alunos lerem no app.");
    if (typeof body.size !== "number" || body.size <= 0 || body.size > MAX_STUDY_PLAN_BYTES) throw new ApiError(400, "invalid_request", "O arquivo precisa ter até 10 MB.");
    const { data, error } = await createAdminClient().storage.from(STUDY_PLAN_BUCKET).createSignedUploadUrl(OFFICIAL_PLANS[body.plano].path, { upsert: true });
    if (error || !data) throw new Error(`Falha ao preparar o envio: ${error?.message ?? "sem retorno"}`);
    return NextResponse.json({ path: data.path, token: data.token, contentType: STUDY_PLAN_TYPES.docx });
  });
}
