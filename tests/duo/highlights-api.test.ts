import { beforeEach, describe, expect, it, vi } from "vitest";
import { paragraphHash } from "@/lib/content/build";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";

const student = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
import { GET as list, POST as create } from "@/app/api/destaques/route";
import { DELETE as remove, PATCH as patch } from "@/app/api/destaques/[id]/route";

let db: FakeDb;
const DISC = "f0000000-0000-4000-8000-000000000001", VER = "f1000000-0000-4000-8000-000000000001";
const P1 = "f3000000-0000-4000-8000-000000000001", P2 = "f3000000-0000-4000-8000-000000000002", P3 = "f3000000-0000-4000-8000-000000000003";
const H = "f4000000-0000-4000-8000-00000000000a";
const as = (user: string) => student.mockResolvedValue({ supabase: makeFakeSupabase(db, user), user: { id: user }, profile: { role: "aluno", active: true } });
const body = (value: unknown, method = "POST") => new Request("http://x/api/destaques", { method, body: JSON.stringify(value) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  db = new FakeDb();
  db.tables.content_versions.push({ id: VER, discipline_id: DISC, status: "published" });
  db.tables.sections.push({ id: "s1", version_id: VER, position: 1, title: "MODELOS", path: [] }, { id: "s2", version_id: VER, position: 2, title: "AUTONOMIA", path: [] });
  [[P1, "s1", 1, "O modelo judicare paga advogados."], [P2, "s1", 2, "O modelo público usa servidores."], [P3, "s2", 1, "A autonomia é funcional."]].forEach(([id, section, position, text]) => db.tables.paragraphs.push({ id, section_id: section, version_id: VER, position, kind: "body", text, hash: paragraphHash(text as string) }));
  as("aluno-a");
});

describe("POST /api/destaques", () => {
  it("o servidor recalcula o trecho e ignora o texto enviado pelo cliente", async () => {
    const response = await create(body({ versionId: VER, start: { paragraphId: P1, offset: 2 }, end: { paragraphId: P1, offset: 17 }, color: "importante", quote: "TEXTO FALSO" }));
    expect(response.status).toBe(201);
    const { highlight } = await response.json();
    expect(highlight).toMatchObject({ quote: "modelo judicare", color: "importante", start: { paragraphId: P1, offset: 2 } });
    expect(db.tables.highlights[0]).toMatchObject({ user_id: "aluno-a", discipline_id: DISC, version_id: VER, quote: "modelo judicare", suffix: " paga advogados.\nO modelo públic" });
  });
  it("cor inválida: 400", async () => {
    expect((await create(body({ versionId: VER, start: { paragraphId: P1, offset: 0 }, end: { paragraphId: P1, offset: 3 }, color: "roxo" }))).status).toBe(400);
  });
  it("anotação acima de 2000 caracteres: 400", async () => {
    expect((await create(body({ versionId: VER, start: { paragraphId: P1, offset: 0 }, end: { paragraphId: P1, offset: 3 }, color: "revisar", note: "x".repeat(2001) }))).status).toBe(400);
  });
  it("grifo atravessando seções ou fora da versão: 400", async () => {
    expect((await create(body({ versionId: VER, start: { paragraphId: P2, offset: 0 }, end: { paragraphId: P3, offset: 3 }, color: "revisar" }))).status).toBe(400);
    expect((await create(body({ versionId: VER, start: { paragraphId: P1, offset: 0 }, end: { paragraphId: P1, offset: 999 }, color: "revisar" }))).status).toBe(400);
    expect(db.tables.highlights).toHaveLength(0);
  });
});

describe("alterar, listar e excluir", () => {
  beforeEach(async () => {
    db.tables.highlights.push({ id: H, user_id: "aluno-b", discipline_id: DISC, version_id: VER, start_paragraph_id: P1, start_offset: 0, end_paragraph_id: P1, end_offset: 1, quote: "O", prefix: "", suffix: "", color: "revisar", note: null, status: "active", reviewed_at: null });
  });
  it("não é possível alterar ou excluir o grifo de outro aluno (404)", async () => {
    expect((await patch(body({ note: "x" }, "PATCH"), ctx(H))).status).toBe(404);
    expect((await remove(new Request("http://x", { method: "DELETE" }), ctx(H))).status).toBe(404);
    expect(db.tables.highlights[0].note).toBeNull();
  });
  it("o dono altera cor, anotação e revisado; lista só os próprios", async () => {
    as("aluno-b");
    expect((await patch(body({ color: "lei_seca", note: "  cai muito  ", reviewed: true }, "PATCH"), ctx(H))).status).toBe(200);
    expect(db.tables.highlights[0]).toMatchObject({ color: "lei_seca", note: "cai muito", reviewed_at: expect.any(String) });
    expect((await patch(body({ reviewed: false, note: "" }, "PATCH"), ctx(H))).status).toBe(200);
    expect(db.tables.highlights[0]).toMatchObject({ reviewed_at: null, note: null });
    const listed = await (await list(new Request(`http://x/api/destaques?versao=${VER}`))).json();
    expect(listed.highlights.map((item: { id: string }) => item.id)).toEqual([H]);
    as("aluno-a");
    expect((await (await list(new Request(`http://x/api/destaques?versao=${VER}`))).json()).highlights).toEqual([]);
  });
  it("o dono exclui", async () => {
    as("aluno-b");
    expect((await remove(new Request("http://x", { method: "DELETE" }), ctx(H))).status).toBe(200);
    expect(db.tables.highlights).toHaveLength(0);
  });
});
