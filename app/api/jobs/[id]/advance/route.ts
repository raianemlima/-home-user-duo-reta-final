import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute, logStage } from "@/lib/server/http";
import { loadJobView, loadNotebook } from "@/lib/server/pipeline";
import { advanceJob } from "@/lib/pipeline/engine";
import { DUO_HANDLERS } from "@/lib/pipeline/handlers";
import { SupabasePipelineRepository, supabasePipelineDeps } from "@/lib/pipeline/supabase-repository";

export const dynamic = "force-dynamic";

// Executa UMA etapa curta. O cliente (ou um agendador) chama de novo até receber "done" ou "failed".
export function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("jobs.advance", async () => {
    const { supabase } = await requireStaff();
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Identificador do job inválido.");
    const repo = new SupabasePipelineRepository(supabase);
    const job = await repo.getJob(id);
    if (!job) throw new ApiError(404, "not_found", "Job não encontrado.");
    const notebook = await loadNotebook(supabase, job.notebookId);
    const outcome = await advanceJob(repo, DUO_HANDLERS, { ...supabasePipelineDeps(supabase, notebook?.settings, notebook?.discipline), cleaningMode: "faithful" }, id, {
      log: (entry) => logStage({ route: "jobs.advance", stage: entry.stage, status: entry.status === "failed" ? "error" : "ok", durationMs: entry.durationMs, code: entry.status }),
    });
    return NextResponse.json({ outcome, view: await loadJobView(supabase, id) });
  });
}
