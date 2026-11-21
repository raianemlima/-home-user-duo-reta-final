import { NextResponse } from "next/server";
import { cardIdOf, failure, FLASHCARD_EXAM_DATE, schedOf } from "@/lib/flashcards/server";
import { isRating, schedule, todayBR } from "@/lib/flashcards/schedule";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Resposta do aluno na revisão (Errei, Difícil, Bom ou Fácil). A próxima data é calculada aqui, no servidor.
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("flashcards.revisar", async () => {
    const { supabase, user } = await requireStudent();
    const id = await cardIdOf(context);
    const body = await readJson(request);
    if (!isRating(body.nota)) throw new ApiError(400, "invalid_request", "Resposta inválida.");
    const { data: card, error } = await supabase.from("flashcards").select("id, interval_days, ease, reps, lapses").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error) failure(error, "ler o flashcard");
    if (!card) throw new ApiError(404, "not_found", "Cartão não encontrado.");
    const next = schedule(schedOf(card), body.nota, todayBR(new Date()), FLASHCARD_EXAM_DATE);
    const { error: updateError } = await supabase.from("flashcards").update({ due_on: next.dueOn, interval_days: next.intervalDays, ease: next.ease, reps: next.reps, lapses: next.lapses, reviewed_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
    if (updateError) failure(updateError, "salvar a revisão");
    return NextResponse.json({ id, ...next });
  });
}
