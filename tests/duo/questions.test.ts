import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Answer, parseQuestionFilter, searchQuestions } from "@/lib/questions/bank";
import { QUESTIONS } from "@/lib/questions/data";
import type { Question } from "@/lib/questions/types";

const q = (id: string, extra: Partial<Question> = {}): Question => ({ id, concurso: "DPE-SP 2023", orgao: "DPE-SP", ano: 2023, banca: "FCC", cargo: "Defensor", disciplina: "Direito Penal", materia: "Direito Penal", assunto: "Dolo", enunciado: `Enunciado ${id} sobre culpabilidade`, alternativas: { A: "a", B: "b", C: "c", D: "d", E: "e" }, gabarito: "B", anulada: false, ...extra });
const bank = [q("1"), q("2", { disciplina: "Direito Civil", assunto: "Posse", ano: 2025, banca: "FGV", orgao: "DPE-PE", concurso: "DPE-PE 2025" }), q("3", { assunto: null, enunciado: "Legítima defesa putativa" })];
const filter = (query: string) => parseQuestionFilter(new URLSearchParams(query));

describe("banco de questões importado", () => {
  it("só DPE-SP e provas de Defensor da FCC desde 2021, com disciplina, ano e banca", () => {
    expect(QUESTIONS).toHaveLength(460);
    expect(QUESTIONS.every((question) => question.disciplina && question.banca && Object.keys(question.alternativas).length === 5)).toBe(true);
    expect(QUESTIONS.every((question) => question.orgao === "DPE-SP" || (question.banca === "FCC" && (question.ano ?? 0) >= 2021))).toBe(true);
    expect(new Set(QUESTIONS.map((question) => question.id)).size).toBe(460);
  });
});

describe("searchQuestions", () => {
  it("filtra por disciplina, ano, banca e órgão; as opções de cada filtro respeitam os demais", () => {
    const result = searchQuestions(bank, filter("disciplina=Direito Penal"), new Map());
    expect(result.items.map((item) => item.id)).toEqual(["1", "3"]);
    expect(result.facets.disciplinas).toEqual([["Direito Civil", 1], ["Direito Penal", 2]]);
    expect(result.facets.assuntos).toEqual([["Dolo", 1]]);
    expect(searchQuestions(bank, filter("ano=2025&banca=FGV&orgao=DPE-PE"), new Map()).items.map((item) => item.id)).toEqual(["2"]);
  });
  it("busca palavras sem acento e sem ordem", () => {
    expect(searchQuestions(bank, filter("busca=defesa legitima"), new Map()).items.map((item) => item.id)).toEqual(["3"]);
  });
  it("traz o gabarito para a correção imediata e filtra pela situação", () => {
    const answers = new Map<string, Answer>([["1", { choice: "B", correct: true }], ["2", { choice: "A", correct: false }]]);
    const all = searchQuestions(bank, filter(""), answers);
    expect(all.items.map((item) => [item.id, item.gabarito])).toEqual([["1", "B"], ["2", "B"], ["3", "B"]]);
    expect(all.stats).toEqual({ respondidas: 2, acertos: 1, total: 3 });
    expect(searchQuestions(bank, filter("situacao=errei"), answers).items.map((item) => item.id)).toEqual(["2"]);
    expect(searchQuestions(bank, filter("situacao=nao-respondidas"), answers).items.map((item) => item.id)).toEqual(["3"]);
  });
  it("pagina de 10 em 10", () => {
    const many = Array.from({ length: 23 }, (_, i) => q(String(i)));
    const page = searchQuestions(many, filter("pagina=3"), new Map());
    expect([page.total, page.paginas, page.items.length]).toEqual([23, 3, 3]);
  });
});

const student = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
import { POST as answer } from "@/app/api/questoes/responder/route";

describe("POST /api/questoes/responder", () => {
  const upsert = vi.fn();
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true"); upsert.mockReset().mockResolvedValue({ error: null }); student.mockResolvedValue({ supabase: { from: () => ({ upsert }) }, user: { id: "u1" } }); });
  const post = (body: unknown) => answer(new Request("http://x/api/questoes/responder", { method: "POST", body: JSON.stringify(body) }));
  it("corrige no servidor, guarda a resposta e devolve o gabarito", async () => {
    const first = QUESTIONS.find((question) => !question.anulada) as Question;
    const wrong = (["A", "B", "C", "D", "E"] as const).find((letter) => letter !== first.gabarito);
    expect(await (await post({ id: first.id, choice: wrong })).json()).toEqual({ correct: false, gabarito: first.gabarito, anulada: false });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", question_id: first.id, choice: wrong, correct: false }), { onConflict: "user_id,question_id" });
    expect((await (await post({ id: first.id, choice: first.gabarito })).json()).correct).toBe(true);
  });
  it("questão ou alternativa inválida é recusada", async () => {
    expect((await post({ id: "nao-existe", choice: "A" })).status).toBe(404);
    expect((await post({ id: QUESTIONS[0].id, choice: "Z" })).status).toBe(400);
  });
});
