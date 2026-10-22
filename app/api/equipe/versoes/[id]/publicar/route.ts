import { NextResponse } from "next/server";
import { publishVersion } from "@/lib/content/repository";
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
    const { data } = await supabase.from("content_versions").select("id").eq("id", id).maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "Versão não encontrada.");
    return NextResponse.json(await publishVersion(createAdminClient(), id));
  });
}
