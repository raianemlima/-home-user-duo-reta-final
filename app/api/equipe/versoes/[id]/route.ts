import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Descarta um rascunho. Versões publicadas ou arquivadas são o histórico dos grifos e nunca são apagadas.
export function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("equipe.versoes.descartar", async () => {
    const { supabase } = await requireStaff();
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Identificador da versão inválido.");
    const { data, error } = await supabase.from("content_versions").select("status").eq("id", id).maybeSingle();
    if (error) throw new Error(`Falha ao ler a versão: ${error.message}`);
    if (!data) throw new ApiError(404, "not_found", "Versão não encontrada.");
    if (data.status !== "draft") throw new ApiError(409, "conflict", "Só rascunhos podem ser descartados.");
    const { error: deleteError } = await supabase.from("content_versions").delete().eq("id", id).eq("status", "draft");
    if (deleteError) throw new Error(`Falha ao descartar: ${deleteError.message}`);
    return NextResponse.json({ deleted: true });
  });
}
