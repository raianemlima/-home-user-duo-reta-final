import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Guarda a última seção aberta em cada disciplina ("continuar de onde parei").
export function PUT(request: Request) {
  return handleRoute("leitura.posicao", async () => {
    const { supabase, user } = await requireStudent();
    const body = await readJson(request);
    const disciplineId = typeof body.disciplineId === "string" ? body.disciplineId : "";
    const sectionId = typeof body.sectionId === "string" ? body.sectionId : "";
    if (!UUID_PATTERN.test(disciplineId) || !UUID_PATTERN.test(sectionId)) throw new ApiError(400, "invalid_request", "Seção inválida.");
    const { error } = await supabase.from("reading_positions").upsert({ user_id: user.id, discipline_id: disciplineId, section_id: sectionId, updated_at: new Date().toISOString() }, { onConflict: "user_id,discipline_id" });
    if (error) throw new Error(`Falha ao guardar a posição: ${error.message}`);
    return NextResponse.json({ saved: true });
  });
}
