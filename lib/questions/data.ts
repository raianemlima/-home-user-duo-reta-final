import "server-only";
import raw from "@/data/questoes.json";
import type { Question } from "@/lib/questions/types";

// Banco importado do repositório REVIEW-RAI (scripts/questoes/importar.mjs). Fica no servidor: o gabarito não vai junto.
export const QUESTIONS = raw as Question[];
export const QUESTIONS_BY_ID = new Map(QUESTIONS.map((question) => [question.id, question]));
