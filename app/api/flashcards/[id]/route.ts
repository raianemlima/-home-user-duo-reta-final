import { NextResponse } from "next/server";
import { validGaps } from "@/lib/flashcards/cloze";
import { CARD_COLUMNS, cardIdOf, failure, MAX_PERGUNTA } from "@/lib/flashcards/server";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Edita a pergunta (cartão de pergunta) ou as lacunas (cartão de lacuna). O trecho não muda.
export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("flashcards.editar", async () => {
    const { supabase, user } = await requireStudent();
    const id = await cardIdOf(context);
    const body = await readJson(request);
    const { data: card, error } = await supabase.from("flashcards").select(CARD_COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error) failure(error, "ler o flashcard");
    if (!card) throw new ApiError(404, "not_found", "Cartão não encontrado.");
    const changes: Record<string, unknown> = {};
    if (card.tipo === "pergunta") {
      const pergunta = typeof body.pergunta === "string" ? body.pergunta.trim() : "";
      if (!pergunta) throw new ApiError(400, "invalid_request", "Escreva a pergunta do cartão.");
      if (pergunta.length > MAX_PERGUNTA) throw new ApiError(400, "invalid_request", `A pergunta pode ter até ${MAX_PERGUNTA} caracteres.`);
      changes.pergunta = pergunta;
    } else {
      if (!validGaps(card.texto as string, body.lacunas)) throw new ApiError(400, "invalid_request", "Escolha pelo menos uma palavra para esconder.");
      changes.lacunas = body.lacunas;
    }
    const { error: updateError } = await supabase.from("flashcards").update(changes).eq("id", id).eq("user_id", user.id);
    if (updateError) failure(updateError, "editar o flashcard");
    return NextResponse.json({ id, ...changes });
  });
}

export function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("flashcards.excluir", async () => {
    const { supabase, user } = await requireStudent();
    const id = await cardIdOf(context);
    const { error } = await supabase.from("flashcards").delete().eq("id", id).eq("user_id", user.id);
    if (error) failure(error, "excluir o flashcard");
    return NextResponse.json({ id, excluido: true });
  });
}
