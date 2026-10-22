import { NextResponse } from "next/server";
import { QUESTIONS_BY_ID } from "@/lib/questions/data";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// O aluno marca uma alternativa: o servidor corrige, guarda a resposta e só então devolve o gabarito.
export function POST(request: Request) {
  return handleRoute("questoes.responder", async () => {
    const { supabase, user } = await requireStudent();
    const body = await readJson(request);
    const question = typeof body.id === "string" ? QUESTIONS_BY_ID.get(body.id) : undefined;
    if (!question) throw new ApiError(404, "not_found", "Questão não encontrada.");
    const choice = typeof body.choice === "string" ? body.choice : "";
    if (!(choice in question.alternativas)) throw new ApiError(400, "invalid_request", "Escolha uma das alternativas.");
    const correct = question.anulada || choice === question.gabarito;
    const { error } = await supabase.from("question_answers").upsert({ user_id: user.id, question_id: question.id, choice, correct, answered_at: new Date().toISOString() }, { onConflict: "user_id,question_id" });
    if (error) throw new Error(`Falha ao salvar a resposta: ${error.message}`);
    return NextResponse.json({ correct, gabarito: question.gabarito, anulada: question.anulada });
  });
}
