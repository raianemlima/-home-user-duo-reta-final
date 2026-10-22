import { NextResponse } from "next/server";
import { readAll } from "@/lib/content/repository";
import { type Answer, parseQuestionFilter, searchQuestions } from "@/lib/questions/bank";
import { QUESTIONS } from "@/lib/questions/data";
import type { Letter } from "@/lib/questions/types";
import { requireStudent } from "@/lib/server/auth";
import { handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleRoute("questoes.listar", async () => {
    const { supabase, user } = await requireStudent();
    const rows = await readAll<{ question_id: string; choice: Letter; correct: boolean }>((from, to) => supabase.from("question_answers").select("question_id, choice, correct").eq("user_id", user.id).order("question_id").range(from, to), "Falha ao ler suas respostas");
    const answers = new Map<string, Answer>(rows.map((row) => [row.question_id, { choice: row.choice, correct: row.correct }]));
    return NextResponse.json(searchQuestions(QUESTIONS, parseQuestionFilter(new URL(request.url).searchParams), answers));
  });
}
