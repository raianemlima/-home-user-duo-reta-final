import { beforeEach, describe, expect, it, vi } from "vitest";
import { paragraphHash } from "@/lib/content/build";
import { todayBR } from "@/lib/flashcards/schedule";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";

const student = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
import { GET as list, POST as create } from "@/app/api/flashcards/route";
import { DELETE as remove, PATCH as patch } from "@/app/api/flashcards/[id]/route";
import { POST as review } from "@/app/api/flashcards/[id]/revisar/route";

let db: FakeDb;
const DISC = "f0000000-0000-4000-8000-000000000001", VER = "f1000000-0000-4000-8000-000000000001";
const S1 = "f2000000-0000-4000-8000-000000000001";
const P1 = "f3000000-0000-4000-8000-000000000001", P2 = "f3000000-0000-4000-8000-000000000002";
const TEXT = "A Defensoria tem prazo em dobro.";
const as = (user: string) => student.mockResolvedValue({ supabase: makeFakeSupabase(db, user), user: { id: user }, profile: { role: "aluno", active: true } });
const req = (value: unknown, method = "POST") => new Request("http://x/api/flashcards", { method, body: JSON.stringify(value) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const sel = (from: number, to: number, paragraph = P1) => ({ versionId: VER, start: { paragraphId: paragraph, offset: from }, end: { paragraphId: paragraph, offset: to } });
const lacuna = async () => (await (await create(req({ ...sel(0, TEXT.length), tipo: "lacuna", lacunas: [[26, 31]] }))).json()).card;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  db = new FakeDb();
  db.tables.flashcards = [];
  db.tables.disciplines.push({ id: DISC, slug: "processo-civil", title: "Direito Processual Civil" });
  db.tables.content_versions.push({ id: VER, discipline_id: DISC, status: "published" });
  db.tables.sections.push({ id: S1, version_id: VER, position: 1, title: "PRAZOS", path: ["PARTE GERAL"] });
  [[P1, 1, TEXT], [P2, 2, "Regra geral."]].forEach(([id, position, text]) => db.tables.paragraphs.push({ id, section_id: S1, version_id: VER, position, kind: "body", text, hash: paragraphHash(text as string) }));
  as("aluno-a");
});

describe("POST /api/flashcards", () => {
  it("cria lacuna com o trecho do servidor, a origem e vencido hoje", async () => {
    const response = await create(req({ ...sel(0, TEXT.length), tipo: "lacuna", lacunas: [[26, 31]], texto: "TEXTO FALSO" }));
    expect(response.status).toBe(201);
    const { card } = await response.json();
    expect(card).toMatchObject({ tipo: "lacuna", texto: TEXT, lacunas: [[26, 31]], origem: "Direito Processual Civil › PARTE GERAL › PRAZOS", disciplineSlug: "processo-civil", sectionId: S1 });
    expect(db.tables.flashcards[0]).toMatchObject({ user_id: "aluno-a", discipline_id: DISC, section_id: S1, due_on: todayBR(new Date()), pergunta: null });
  });
  it("cria pergunta e resposta; o trecho pode atravessar parágrafos", async () => {
    const response = await create(req({ versionId: VER, start: { paragraphId: P1, offset: 17 }, end: { paragraphId: P2, offset: 5 }, tipo: "pergunta", pergunta: "  Qual o prazo?  " }));
    expect(response.status).toBe(201);
    expect((await response.json()).card).toMatchObject({ tipo: "pergunta", pergunta: "Qual o prazo?", texto: "prazo em dobro.\nRegra", lacunas: [] });
  });
  it("recusa lacuna inválida, pergunta vazia ou longa, tipo desconhecido e trecho grande", async () => {
    expect((await create(req({ ...sel(0, 10), tipo: "lacuna", lacunas: [] }))).status).toBe(400);
    expect((await create(req({ ...sel(0, 10), tipo: "lacuna", lacunas: [[0, 40]] }))).status).toBe(400);
    expect((await create(req({ ...sel(0, 10), tipo: "pergunta", pergunta: "   " }))).status).toBe(400);
    expect((await create(req({ ...sel(0, 10), tipo: "pergunta", pergunta: "x".repeat(301) }))).status).toBe(400);
    expect((await create(req({ ...sel(0, 10), tipo: "cloze", pergunta: "x" }))).status).toBe(400);
    const longo = "palavra ".repeat(200);
    db.tables.paragraphs[0].text = longo; db.tables.paragraphs[0].hash = paragraphHash(longo);
    expect((await create(req({ ...sel(0, longo.length), tipo: "pergunta", pergunta: "x" }))).status).toBe(400);
    expect(db.tables.flashcards).toEqual([]);
  });
  it("limite de 3000 cartões por aluno", async () => {
    for (let i = 0; i < 3000; i++) db.tables.flashcards.push({ id: `c${i}`, owner_id: "aluno-a", user_id: "aluno-a" });
    const response = await create(req({ ...sel(0, 10), tipo: "pergunta", pergunta: "x" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/limite de 3000/);
  });
});

describe("lista, revisão, edição e exclusão", () => {
  it("lista só os cartões do aluno; seção que sumiu na republicação perde o link", async () => {
    await lacuna();
    as("aluno-b"); expect((await (await list(new Request("http://x/api/flashcards"))).json()).cards).toEqual([]);
    as("aluno-a"); db.tables.content_versions[0].status = "archived";
    const payload = await (await list(new Request("http://x/api/flashcards"))).json();
    expect(payload).toMatchObject({ disponivel: true, hoje: todayBR(new Date()) });
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards[0]).toMatchObject({ texto: TEXT, sectionId: null, dueOn: todayBR(new Date()) });
  });
  it("Bom num cartão novo: volta amanhã; Errei: continua vencido hoje", async () => {
    const card = await lacuna();
    const bom = await (await review(req({ nota: "bom" }), ctx(card.id))).json();
    expect(bom).toMatchObject({ intervalDays: 1, reps: 1 });
    expect(db.tables.flashcards[0].due_on).toBe(bom.dueOn);
    expect(bom.dueOn > todayBR(new Date())).toBe(true);
    const errei = await (await review(req({ nota: "errei" }), ctx(card.id))).json();
    expect(errei).toMatchObject({ intervalDays: 0, reps: 0, lapses: 1, dueOn: todayBR(new Date()) });
    expect((await review(req({ nota: "talvez" }), ctx(card.id))).status).toBe(400);
  });
  it("edita lacunas e pergunta, valida, e só o dono altera ou exclui", async () => {
    const card = await lacuna();
    expect((await patch(req({ lacunas: [[17, 31]] }, "PATCH"), ctx(card.id))).status).toBe(200);
    expect(db.tables.flashcards[0].lacunas).toEqual([[17, 31]]);
    expect((await patch(req({ lacunas: [] }, "PATCH"), ctx(card.id))).status).toBe(400);
    as("aluno-b");
    expect((await patch(req({ lacunas: [[0, 1]] }, "PATCH"), ctx(card.id))).status).toBe(404);
    expect((await review(req({ nota: "facil" }), ctx(card.id))).status).toBe(404);
    await remove(req({}, "DELETE"), ctx(card.id));
    expect(db.tables.flashcards).toHaveLength(1);
    as("aluno-a");
    expect((await remove(req({}, "DELETE"), ctx(card.id))).status).toBe(200);
    expect(db.tables.flashcards).toHaveLength(0);
    expect((await remove(req({}, "DELETE"), ctx("nao-e-uuid"))).status).toBe(400);
  });
});

describe("resumo do Início", () => {
  it("conta os cartões para hoje e o total", async () => {
    await lacuna(); const outro = await lacuna();
    await review(req({ nota: "facil" }), ctx(outro.id));
    expect(await (await list(new Request("http://x/api/flashcards?resumo=1"))).json()).toMatchObject({ disponivel: true, paraHoje: 1, total: 2 });
  });
});

describe("sem a migração 0022", () => {
  it("a lista diz 'indisponível' e as escritas respondem 503", async () => {
    const fake = makeFakeSupabase(db, "aluno-a");
    const broken = { select: () => broken, eq: () => broken, lte: () => broken, order: () => broken, range: () => broken, maybeSingle: () => broken, insert: () => broken, single: () => broken,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, count: null, error: { code: "PGRST205", message: "Could not find the table 'public.flashcards'" } }).then(resolve) };
    student.mockResolvedValue({ supabase: { ...fake, from: (table: string) => table === "flashcards" ? broken : fake.from(table) }, user: { id: "aluno-a" } });
    expect(await (await list(new Request("http://x/api/flashcards"))).json()).toMatchObject({ disponivel: false, cards: [] });
    expect(await (await list(new Request("http://x/api/flashcards?resumo=1"))).json()).toMatchObject({ disponivel: false, paraHoje: 0 });
    expect((await create(req({ ...sel(0, 10), tipo: "pergunta", pergunta: "x" }))).status).toBe(503);
    expect((await review(req({ nota: "bom" }), ctx("f9000000-0000-4000-8000-000000000001"))).status).toBe(503);
  });
});
