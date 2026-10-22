import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Ativa ou desativa o acesso. Desativar não apaga grifos nem anotações.
export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("equipe.alunos.alterar", async () => {
    const { supabase, user } = await requireStaff();
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Identificador do aluno inválido.");
    const body = await readJson(request);
    if (typeof body.active !== "boolean") throw new ApiError(400, "invalid_request", "Informe se o acesso fica ativo.");
    if (id === user.id && !body.active) throw new ApiError(400, "invalid_request", "Você não pode desativar o próprio acesso.");
    const { data, error } = await supabase.from("profiles").update({ active: body.active }).eq("user_id", id).select("user_id");
    if (error) throw new Error(`Falha ao alterar o acesso: ${error.message}`);
    if (!(data as unknown[] | null)?.length) throw new ApiError(404, "not_found", "Aluno não encontrado.");
    return NextResponse.json({ active: body.active });
  });
}
