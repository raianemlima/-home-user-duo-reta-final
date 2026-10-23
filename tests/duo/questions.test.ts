import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Answer, parseQuestionFilter, searchQuestions } from "@/lib/questions/bank";
import { QUESTIONS } from "@/lib/questions/data";
import { FUNDAMENTACOES } from "@/lib/questions/fundamentacao";
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

// Fontes oficiais aceitas na fundamentação; a mesma lista está em scripts/questoes/conferir-fundamentacao.mjs.
const OFFICIAL = ["planalto.gov.br", "stf.jus.br", "stj.jus.br", "senado.leg.br", "camara.leg.br", "cnj.jus.br", "tst.jus.br", "tse.jus.br", "defensoria.sp.def.br", "al.sp.gov.br", "oas.org", "ohchr.org", "un.org", "mpsp.mp.br", "condege.org.br", "gov.br"];

describe("fundamentação legal do gabarito", () => {
  const ids = new Set(QUESTIONS.map((question) => question.id));
  it("só aponta para questões do banco e sempre cita dispositivo com texto e fonte oficial", () => {
    for (const [id, item] of FUNDAMENTACOES) {
      expect(ids, `${id} não está no banco`).toContain(id);
      expect(item.nota.trim().length, `${id}: nota curta`).toBeGreaterThan(14);
      expect(item.conferido, `${id}: data`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Lista vazia só com ressalva: questão que não dá para fundamentar (norma estadual/interna, história, texto).
      if (item.dispositivos.length === 0) expect(item.ressalva, `${id}: sem dispositivos e sem ressalva`).toBeTruthy();
      for (const dispositivo of item.dispositivos) {
        const where = `${id} (${dispositivo.ref})`;
        expect(dispositivo.ref.trim(), `${id}: ref vazia`).not.toBe("");
        expect(["lei", "entendimento"], `${where}: tipo`).toContain(dispositivo.tipo);
        expect(dispositivo.texto.trim().length, `${where}: texto curto`).toBeGreaterThan(19);
        // Transcrição literal só entra com a página oficial de onde veio; resumo de entendimento pode não ter link.
        if (dispositivo.tipo === "lei") expect(dispositivo.url, `${where}: lei sem url`).toBeTruthy();
        if (!dispositivo.url) continue;
        const host = new URL(dispositivo.url).hostname;
        expect(OFFICIAL.some((domain) => host === domain || host.endsWith(`.${domain}`)), `${where}: ${host} não é fonte oficial`).toBe(true);
      }
      const refs = item.dispositivos.map((dispositivo) => dispositivo.ref);
      expect(new Set(refs).size, `${id}: refs repetidas`).toBe(refs.length);
    }
  });
  it("questão anulada não recebe fundamentação de gabarito", () => {
    const anuladas = QUESTIONS.filter((question) => question.anulada).map((question) => question.id);
    for (const id of anuladas) expect(FUNDAMENTACOES.has(id) ? FUNDAMENTACOES.get(id)?.ressalva : "ok", `${id}: anulada precisa de ressalva`).toBeTruthy();
  });
});

const student = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
import { POST as answer } from "@/app/api/questoes/responder/route";
import { GET as basis } from "@/app/api/questoes/[id]/fundamentacao/route";
import { DELETE as restart } from "@/app/api/questoes/route";

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

describe("DELETE /api/questoes (recomeçar)", () => {
  const calls: unknown[][] = [];
  const builder = { delete: (...args: unknown[]) => { calls.push(["delete", ...args]); return builder; }, eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return builder; }, in: (...args: unknown[]) => { calls.push(["in", ...args]); return builder; }, then: (resolve: (value: unknown) => void) => resolve({ error: null, count: 2 }) };
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true"); calls.length = 0; student.mockResolvedValue({ supabase: { from: () => builder }, user: { id: "u1" } }); });
  const del = (body?: unknown) => restart(new Request("http://x/api/questoes", { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }));
  it("apaga todas as respostas do aluno, ou só as da seleção", async () => {
    expect(await (await del()).json()).toEqual({ removed: 2 });
    expect(calls).toEqual([["delete", { count: "exact" }], ["eq", "user_id", "u1"]]);
    calls.length = 0;
    await del({ ids: ["q1", "q2"] });
    expect(calls).toContainEqual(["in", "question_id", ["q1", "q2"]]);
    expect((await del({ ids: "tudo" })).status).toBe(400);
  });
});

describe("GET /api/questoes/[id]/fundamentacao", () => {
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true"); student.mockResolvedValue({ supabase: {}, user: { id: "u1" } }); });
  const get = (id: string) => basis(new Request(`http://x/api/questoes/${id}/fundamentacao`), { params: Promise.resolve({ id }) });
  it("devolve a fundamentação conferida da questão", async () => {
    const first = [...FUNDAMENTACOES][0];
    expect(first, "data/fundamentacoes.json está vazio").toBeTruthy();
    const [id, item] = first;
    expect(await (await get(id)).json()).toEqual({ fundamentacao: item });
  });
  it("devolve null quando a questão ainda não tem fundamentação, e 404 quando não existe", async () => {
    const sem = QUESTIONS.find((question) => !FUNDAMENTACOES.has(question.id));
    if (sem) expect(await (await get(sem.id)).json()).toEqual({ fundamentacao: null });
    expect((await get("nao-existe")).status).toBe(404);
  });
});
