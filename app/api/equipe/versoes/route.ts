import { NextResponse } from "next/server";
import { buildDraft } from "@/lib/content/build";
import { saveDraft } from "@/lib/content/repository";
import { requireStaff } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";
import type { SegmentationResult } from "@/lib/segmentation/types";

export const dynamic = "force-dynamic";

// Transforma a saída da etapa de segmentação de um job concluído num rascunho de versão da disciplina.
export function POST(request: Request) {
  return handleRoute("equipe.versoes.criar", async () => {
    const { supabase } = await requireStaff();
    const body = await readJson(request);
    const disciplineId = typeof body.disciplineId === "string" ? body.disciplineId : "";
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!UUID_PATTERN.test(disciplineId) || !UUID_PATTERN.test(jobId)) throw new ApiError(400, "invalid_request", "Disciplina ou processamento inválido.");
    if (!label || label.length > 120) throw new ApiError(400, "invalid_request", "Informe um rótulo de versão com até 120 caracteres.");

    const { data: job, error: jobError } = await supabase.from("jobs").select("id, status").eq("id", jobId).maybeSingle();
    if (jobError) throw new Error(`Falha ao ler o processamento: ${jobError.message}`);
    if (!job) throw new ApiError(404, "not_found", "Processamento não encontrado.");
    if (job.status !== "succeeded") throw new ApiError(409, "conflict", "O processamento ainda não terminou.");
    const { data: stages, error: stageError } = await supabase.from("job_stages").select("subject_id, output").eq("job_id", jobId).eq("stage", "segmentation");
    if (stageError) throw new Error(`Falha ao ler a segmentação: ${stageError.message}`);
    if (!stages || stages.length !== 1 || !stages[0].output) throw new ApiError(409, "conflict", "Envie um único arquivo por versão da disciplina.");
    const { data: document } = await supabase.from("documents").select("sha256, storage_path, file_name").eq("id", stages[0].subject_id).maybeSingle();

    const sections = buildDraft(stages[0].output as SegmentationResult);
    if (!sections.length) throw new ApiError(422, "empty_content", "Nenhum conteúdo foi encontrado no arquivo.");
    const { versionId } = await saveDraft(supabase, { disciplineId, label, sourceSha256: (document?.sha256 as string | undefined) ?? "", sourcePath: (document?.storage_path as string | undefined) ?? null, sourceFileName: (document?.file_name as string | undefined) ?? null, jobId, sections });
    return NextResponse.json({ versionId }, { status: 201 });
  });
}
