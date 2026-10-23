import { NextResponse } from "next/server";
import { readAll } from "@/lib/content/repository";
import { QUESTIONS } from "@/lib/questions/data";
import type { Letter } from "@/lib/questions/types";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Uma chamada só: o banco inteiro e as respostas do aluno. Filtros e páginas ficam no aparelho, sem esperar o servidor.
export function GET() {
  return handleRoute("questoes.listar", async () => {
    const { supabase, user } = await requireStudent();
    const rows = await readAll<{ question_id: string; choice: Letter; correct: boolean }>((from, to) => supabase.from("question_answers").select("question_id, choice, correct").eq("user_id", user.id).order("question_id").range(from, to), "Falha ao ler suas respostas");
    return NextResponse.json({ questions: QUESTIONS, answers: Object.fromEntries(rows.map((row) => [row.question_id, { choice: row.choice, correct: row.correct }])) });
  });
}

// Recomeçar: apaga as respostas do aluno — todas, ou só as das questões indicadas (a seleção filtrada na tela).
export function DELETE(request: Request) {
  return handleRoute("questoes.recomecar", async () => {
    const { supabase, user } = await requireStudent();
    const body = await readJson(request).catch(() => ({} as Record<string, unknown>));
    const ids = body.ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 2000 || ids.some((id) => typeof id !== "string" || id.length > 100))) throw new ApiError(400, "invalid_request", "Seleção de questões inválida.");
    let query = supabase.from("question_answers").delete({ count: "exact" }).eq("user_id", user.id);
    if (Array.isArray(ids)) { if (!ids.length) return NextResponse.json({ removed: 0 }); query = query.in("question_id", ids as string[]); }
    const { error, count } = await query;
    if (error) throw new Error(`Falha ao apagar suas respostas: ${error.message}`);
    return NextResponse.json({ removed: count ?? 0 });
  });
}
