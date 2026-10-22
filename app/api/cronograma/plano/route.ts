import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";
import { isPlanChoice } from "@/lib/study-plan";

export const dynamic = "force-dynamic";

// O aluno escolhe qual cronograma seguir: "4h", "6h" (oficiais do DUO) ou "proprio" (o arquivo que enviou).
export function PUT(request: Request) {
  return handleRoute("cronograma.escolher", async () => {
    const { supabase, user } = await requireStudent();
    const body = await readJson(request);
    if (!isPlanChoice(body.plano)) throw new ApiError(400, "invalid_request", "Escolha o cronograma de 4h, de 6h ou o seu.");
    const { error } = await supabase.from("study_plan_choices").upsert({ user_id: user.id, plano: body.plano, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(`Falha ao salvar a escolha: ${error.message}`);
    return NextResponse.json({ plano: body.plano });
  });
}
