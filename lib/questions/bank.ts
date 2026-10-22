import type { Letter, Question } from "@/lib/questions/types";

export type Situation = "todas" | "nao-respondidas" | "acertei" | "errei";
export type QuestionFilter = { disciplina: string; assunto: string; ano: string; banca: string; orgao: string; situacao: Situation; busca: string };
export type Answer = { choice: Letter; correct: boolean };
export type Facets = { disciplinas: [string, number][]; assuntos: [string, number][]; anos: [string, number][]; bancas: [string, number][]; orgaos: [string, number][] };
// Questão como vai para o navegador: o gabarito só aparece depois que o aluno responde.
export type QuestionView = Omit<Question, "gabarito"> & { gabarito: Letter | null; resposta: Answer | null };

export const PAGE_SIZE = 10;
const SITUATIONS: Situation[] = ["todas", "nao-respondidas", "acertei", "errei"];
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parseQuestionFilter(params: URLSearchParams): QuestionFilter & { pagina: number } {
  const get = (key: string) => (params.get(key) ?? "").trim().slice(0, 200);
  const situacao = get("situacao") as Situation;
  return { disciplina: get("disciplina"), assunto: get("assunto"), ano: get("ano"), banca: get("banca"), orgao: get("orgao"), busca: get("busca"), situacao: SITUATIONS.includes(situacao) ? situacao : "todas", pagina: Math.max(1, Math.min(1000, Number(get("pagina")) || 1)) };
}

function count(values: (string | null)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
}

export function matches(question: Question, filter: QuestionFilter, answers: Map<string, Answer>, ignore?: keyof QuestionFilter): boolean {
  const answer = answers.get(question.id);
  if (ignore !== "disciplina" && filter.disciplina && question.disciplina !== filter.disciplina) return false;
  if (ignore !== "assunto" && filter.assunto && question.assunto !== filter.assunto) return false;
  if (ignore !== "ano" && filter.ano && String(question.ano) !== filter.ano) return false;
  if (ignore !== "banca" && filter.banca && question.banca !== filter.banca) return false;
  if (ignore !== "orgao" && filter.orgao && question.orgao !== filter.orgao) return false;
  if (filter.situacao === "nao-respondidas" && answer) return false;
  if (filter.situacao === "acertei" && !answer?.correct) return false;
  if (filter.situacao === "errei" && (!answer || answer.correct)) return false;
  if (filter.busca) {
    const needle = fold(filter.busca);
    const haystack = fold([question.enunciado, ...Object.values(question.alternativas), question.assunto ?? "", question.materia].join(" "));
    if (!needle.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

// Filtra, conta as opções de cada filtro (cada contagem respeita os outros filtros) e devolve uma página.
export function searchQuestions(bank: Question[], filter: QuestionFilter & { pagina: number }, answers: Map<string, Answer>) {
  const found = bank.filter((question) => matches(question, filter, answers));
  const facet = (key: keyof QuestionFilter, pick: (question: Question) => string | null) => count(bank.filter((question) => matches(question, filter, answers, key)).map(pick));
  const facets: Facets = {
    disciplinas: facet("disciplina", (question) => question.disciplina),
    assuntos: facet("assunto", (question) => question.assunto),
    anos: facet("ano", (question) => (question.ano ? String(question.ano) : null)).sort((a, b) => b[0].localeCompare(a[0])),
    bancas: facet("banca", (question) => question.banca),
    orgaos: facet("orgao", (question) => question.orgao),
  };
  const start = (filter.pagina - 1) * PAGE_SIZE;
  const items: QuestionView[] = found.slice(start, start + PAGE_SIZE).map((question) => {
    const resposta = answers.get(question.id) ?? null;
    return { ...question, gabarito: resposta || question.anulada ? question.gabarito : null, resposta };
  });
  const answered = bank.filter((question) => answers.has(question.id));
  return { total: found.length, pagina: filter.pagina, paginas: Math.max(1, Math.ceil(found.length / PAGE_SIZE)), items, facets, stats: { respondidas: answered.length, acertos: answered.filter((question) => answers.get(question.id)?.correct).length, total: bank.length } };
}
