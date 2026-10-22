import { NextResponse } from "next/server";
import { readAll } from "@/lib/content/repository";
import { QUESTIONS } from "@/lib/questions/data";
import type { Letter } from "@/lib/questions/types";
import { requireStudent } from "@/lib/server/auth";
import { handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Uma chamada só: o banco inteiro e as respostas do aluno. Filtros e páginas ficam no aparelho, sem esperar o servidor.
export function GET() {
  return handleRoute("questoes.listar", async () => {
    const { supabase, user } = await requireStudent();
    const rows = await readAll<{ question_id: string; choice: Letter; correct: boolean }>((from, to) => supabase.from("question_answers").select("question_id, choice, correct").eq("user_id", user.id).order("question_id").range(from, to), "Falha ao ler suas respostas");
    return NextResponse.json({ questions: QUESTIONS, answers: Object.fromEntries(rows.map((row) => [row.question_id, { choice: row.choice, correct: row.correct }])) });
  });
}
