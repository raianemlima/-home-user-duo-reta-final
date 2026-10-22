import { NextResponse } from "next/server";
import { fundamentacaoDe } from "@/lib/questions/fundamentacao";
import { QUESTIONS_BY_ID } from "@/lib/questions/data";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// A fundamentação de UMA questão, buscada quando o aluno já viu o gabarito: mantém a primeira carga leve.
export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("questoes.fundamentacao", async () => {
    await requireStudent();
    const { id } = await params;
    if (!QUESTIONS_BY_ID.has(id)) throw new ApiError(404, "not_found", "Questão não encontrada.");
    return NextResponse.json({ fundamentacao: fundamentacaoDe(id) });
  });
}
