import "server-only";
import raw from "@/data/questoes.json";
import type { Question } from "@/lib/questions/types";

// Banco importado do repositório REVIEW-RAI (scripts/questoes/importar.mjs). GET /api/questoes manda o banco inteiro,
// com o gabarito, porque a correção é imediata no aparelho; a resposta gravada é corrigida de novo aqui, no servidor.
export const QUESTIONS = raw as Question[];
export const QUESTIONS_BY_ID = new Map(QUESTIONS.map((question) => [question.id, question]));
