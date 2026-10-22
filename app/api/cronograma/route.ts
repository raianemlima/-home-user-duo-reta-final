import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";
import { isPlanChoice, OFFICIAL_PLANS, type PlanChoice, STUDY_PLAN_BUCKET, studyPlanPath } from "@/lib/study-plan";

export const dynamic = "force-dynamic";

type StoredFile = { name: string; created_at?: string | null; updated_at?: string | null; metadata?: { size?: number } | null };

async function listOwn(userId: string): Promise<StoredFile[]> {
  const { data, error } = await createAdminClient().storage.from(STUDY_PLAN_BUCKET).list(userId, { limit: 20 });
  if (error) throw new Error(`Falha ao ler o cronograma: ${error.message}`);
  return ((data ?? []) as StoredFile[]).filter((file) => file.name && file.name !== ".emptyFolderPlaceholder");
}

// O que o aluno segue hoje: um cronograma oficial (4h/6h) ou o próprio arquivo; e quais oficiais a equipe já publicou.
export function GET() {
  return handleRoute("cronograma.ler", async () => {
    const { supabase, user } = await requireStudent();
    const [own, official, choice] = await Promise.all([
      listOwn(user.id),
      createAdminClient().storage.from(STUDY_PLAN_BUCKET).list("oficiais", { limit: 20 }),
      supabase.from("study_plan_choices").select("plano").eq("user_id", user.id).maybeSingle(),
    ]);
    if (official.error) throw new Error(`Falha ao ler os cronogramas oficiais: ${official.error.message}`);
    if (choice.error) throw new Error(`Falha ao ler a escolha de cronograma: ${choice.error.message}`);
    const [file] = own.sort((a, b) => String(b.updated_at ?? b.created_at).localeCompare(String(a.updated_at ?? a.created_at)));
    const published = new Set((official.data ?? []).map((item) => `oficiais/${item.name}`));
    const oficiais = Object.fromEntries(Object.entries(OFFICIAL_PLANS).map(([key, plan]) => [key, published.has(plan.path)]));
    const stored = choice.data?.plano;
    const plano: PlanChoice | null = isPlanChoice(stored) ? stored : file ? "proprio" : null;
    return NextResponse.json({ plano, oficiais, file: file ? { name: file.name, size: file.metadata?.size ?? null, updatedAt: file.updated_at ?? file.created_at ?? null } : null });
  });
}

// Prepara o envio: o navegador sobe o arquivo direto para o armazenamento (sem o limite de corpo das funções da Vercel).
// O arquivo anterior sai antes, para o aluno ter sempre um só cronograma.
export function POST(request: Request) {
  return handleRoute("cronograma.preparar", async () => {
    const { user } = await requireStudent();
    const body = await readJson(request);
    const target = studyPlanPath(user.id, body.fileName, body.size);
    if ("error" in target) throw new ApiError(400, "invalid_request", target.error);
    const storage = createAdminClient().storage.from(STUDY_PLAN_BUCKET);
    const old = (await listOwn(user.id)).map((file) => `${user.id}/${file.name}`).filter((path) => path !== target.path);
    if (old.length) await storage.remove(old);
    const { data, error } = await storage.createSignedUploadUrl(target.path, { upsert: true });
    if (error || !data) throw new Error(`Falha ao preparar o envio: ${error?.message ?? "sem retorno"}`);
    return NextResponse.json({ path: data.path, token: data.token, contentType: target.contentType });
  });
}

export function DELETE() {
  return handleRoute("cronograma.remover", async () => {
    const { supabase, user } = await requireStudent();
    // Sem arquivo próprio, a escolha "proprio" deixa de valer.
    await supabase.from("study_plan_choices").delete().eq("user_id", user.id).eq("plano", "proprio");
    const files = (await listOwn(user.id)).map((file) => `${user.id}/${file.name}`);
    if (files.length) {
      const { error } = await createAdminClient().storage.from(STUDY_PLAN_BUCKET).remove(files);
      if (error) throw new Error(`Falha ao remover o cronograma: ${error.message}`);
    }
    return NextResponse.json({ removed: files.length });
  });
}
