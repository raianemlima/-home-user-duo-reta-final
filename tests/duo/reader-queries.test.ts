import { beforeEach, describe, expect, it, vi } from "vitest";
import { listDisciplines, loadSection, searchDiscipline } from "@/lib/reader/queries";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";

const student = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
import { GET as search } from "@/app/api/busca/route";
import { PUT as savePosition } from "@/app/api/leitura/posicao/route";

let db: FakeDb;
const sb = () => makeFakeSupabase(db, "aluno") as never;
const PENAL = "f0000000-0000-4000-8000-000000000001", CIVIL = "f0000000-0000-4000-8000-000000000002";

function seed() {
  db.tables.disciplines.push({ id: CIVIL, slug: "civil", title: "Direito Civil", position: 2 }, { id: PENAL, slug: "penal", title: "Direito Penal", position: 1 });
  db.tables.content_versions.push(
    { id: "v-old", discipline_id: PENAL, label: "Pré-edital", status: "archived", published_at: "2026-07-29T00:00:00Z" },
    { id: "v-pen", discipline_id: PENAL, label: "Atualizado em 21/10/2026", status: "published", published_at: "2026-10-21T12:00:00Z" },
    { id: "v-civ", discipline_id: CIVIL, label: "Pré-edital", status: "published", published_at: "2026-07-29T00:00:00Z" },
  );
  [["s1", 1, 1, "1", "CRIMES"], ["s2", 2, 2, "1.1", "Homicídio"], ["s3", 3, 1, "2", "PENAS"]].forEach(([id, position, level, numbering, title]) => db.tables.sections.push({ id, version_id: "v-pen", position, level, numbering, title, path: [] }));
  db.tables.sections.push({ id: "old-s1", version_id: "v-old", position: 1, level: 1, numbering: "1", title: "CRIMES", path: [] });
  db.tables.paragraphs.push(
    { id: "p2", section_id: "s1", version_id: "v-pen", position: 2, kind: "tip", text: "DICA DUO cai muito na prova.", hash: "b" },
    { id: "p1", section_id: "s1", version_id: "v-pen", position: 1, kind: "body", text: "Crime é fato típico, ilícito e culpável; redução de 50% da pena.", hash: "a" },
    { id: "p3", section_id: "s2", version_id: "v-pen", position: 1, kind: "body", text: "Homicídio simples: matar alguém.", hash: "c" },
    { id: "p4", section_id: "s3", version_id: "v-pen", position: 1, kind: "body", text: "Redução de 50 por cento não é o mesmo que fato_tipico.", hash: "d" },
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  db = new FakeDb(); seed();
  student.mockResolvedValue({ supabase: sb(), user: { id: "aluno" }, profile: { role: "aluno", active: true } });
});

describe("listDisciplines", () => {
  it("ordena por posição, mostra rótulo e selo de atualização desde a última visita", async () => {
    db.tables.reading_positions.push({ user_id: "aluno", discipline_id: PENAL, section_id: "old-s1", updated_at: "2026-08-10T00:00:00Z" }, { user_id: "aluno", discipline_id: CIVIL, section_id: "x", updated_at: "2026-08-10T00:00:00Z" }, { user_id: "outro", discipline_id: CIVIL, section_id: "y", updated_at: "2026-01-01T00:00:00Z" });
    const cards = await listDisciplines(sb(), "aluno");
    expect(cards.map((card) => [card.slug, card.versionLabel, card.updatedSinceLastVisit])).toEqual([["penal", "Atualizado em 21/10/2026", true], ["civil", "Pré-edital", false]]);
  });
  it("seção lida numa versão antiga não vale como ponto de retomada", async () => {
    db.tables.reading_positions.push({ user_id: "aluno", discipline_id: PENAL, section_id: "old-s1", updated_at: "2026-08-10T00:00:00Z" });
    expect((await listDisciplines(sb(), "aluno"))[0].lastSectionId).toBeNull();
    db.tables.reading_positions[0].section_id = "s2";
    expect((await listDisciplines(sb(), "aluno"))[0].lastSectionId).toBe("s2");
  });
  it("disciplina sem versão publicada não aparece", async () => {
    db.tables.disciplines.push({ id: "f0000000-0000-4000-8000-000000000003", slug: "nova", title: "Nova", position: 0 });
    expect((await listDisciplines(sb(), "aluno")).map((card) => card.slug)).toEqual(["penal", "civil"]);
  });
});

describe("loadSection", () => {
  it("devolve sumário, parágrafos na ordem e vizinhos", async () => {
    const view = await loadSection(sb(), "penal", "s1");
    expect(view?.toc.map((item) => item.id)).toEqual(["s1", "s2", "s3"]);
    expect(view?.toc[1].path).toEqual([]);
    expect(view?.section.paragraphs.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect([view?.prevId, view?.nextId]).toEqual([null, "s2"]);
    const last = await loadSection(sb(), "penal", "s3");
    expect([last?.prevId, last?.nextId]).toEqual(["s2", null]);
  });
  it("slug desconhecido ou seção de outra versão: null", async () => {
    expect(await loadSection(sb(), "nada", "s1")).toBeNull();
    expect(await loadSection(sb(), "penal", "old-s1")).toBeNull();
  });
});

describe("busca", () => {
  it("exige 3 caracteres e escapa % e _", async () => {
    expect(await searchDiscipline(sb(), "penal", "cr")).toEqual([]);
    expect((await searchDiscipline(sb(), "penal", "50%")).map((hit) => hit.sectionId)).toEqual(["s1"]);
    expect((await searchDiscipline(sb(), "penal", "fato_tipico")).map((hit) => hit.sectionId)).toEqual(["s3"]);
  });
  it("trecho de contexto contém o termo e ignora maiúsculas", async () => {
    const [hit] = await searchDiscipline(sb(), "penal", "HOMICÍDIO SIMPLES");
    expect(hit).toMatchObject({ sectionId: "s2", sectionTitle: "Homicídio" });
    expect(hit.snippet).toContain("Homicídio simples");
  });
  it("rota de busca", async () => {
    const response = await search(new Request("http://x/api/busca?disciplina=penal&q=matar"));
    expect((await response.json()).results).toHaveLength(1);
  });
});

describe("posição de leitura", () => {
  it("grava a seção atual do aluno (upsert)", async () => {
    const put = (sectionId: string) => savePosition(new Request("http://x", { method: "PUT", body: JSON.stringify({ disciplineId: PENAL, sectionId }) }));
    expect((await put("a0000000-0000-4000-8000-000000000001")).status).toBe(200);
    expect((await put("a0000000-0000-4000-8000-000000000002")).status).toBe(200);
    expect(db.tables.reading_positions).toEqual([expect.objectContaining({ user_id: "aluno", discipline_id: PENAL, section_id: "a0000000-0000-4000-8000-000000000002" })]);
  });
  it("ids inválidos: 400", async () => {
    expect((await savePosition(new Request("http://x", { method: "PUT", body: JSON.stringify({ disciplineId: "x", sectionId: "y" }) }))).status).toBe(400);
  });
});

describe("sumário com capítulos", () => {
  it("chapterBreaks marca onde começa cada capítulo que só existe no caminho", async () => {
    const { chapterBreaks } = await import("@/lib/reader/queries");
    const toc = [
      { id: "a", level: 2, numbering: "1.1", title: "Critérios", path: ["MODELOS"] },
      { id: "b", level: 2, numbering: "1.2", title: "Exceções", path: ["MODELOS"] },
      { id: "c", level: 1, numbering: "2", title: "AUTONOMIA", path: [] },
      { id: "d", level: 2, numbering: "2.1", title: "Funcional", path: ["AUTONOMIA"] },
    ];
    expect(chapterBreaks(toc)).toEqual(new Map([["a", "MODELOS"]]));
  });
});
