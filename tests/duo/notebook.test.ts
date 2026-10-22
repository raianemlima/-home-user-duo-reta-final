import { beforeEach, describe, expect, it } from "vitest";
import { loadNotebook, ORPHAN_TOPIC } from "@/lib/notebook/queries";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";

let db: FakeDb;
const sb = () => makeFakeSupabase(db, "aluno") as never;
let seq = 0;
function hl(user: string, discipline: string, version: string, paragraph: string, offset: number, extra: Record<string, unknown> = {}) {
  db.tables.highlights.push({ id: `h${(seq += 1)}`, user_id: user, discipline_id: discipline, version_id: version, start_paragraph_id: paragraph, start_offset: offset, end_paragraph_id: paragraph, end_offset: offset + 3, quote: `q${seq}`, prefix: "", suffix: "", color: "importante", note: null, status: "active", orphaned_at: null, reviewed_at: null, ...extra });
}

beforeEach(() => {
  db = new FakeDb(); seq = 0;
  db.tables.disciplines.push({ id: "civ", slug: "civil", title: "Direito Civil", position: 2 }, { id: "pen", slug: "penal", title: "Direito Penal", position: 1 });
  db.tables.content_versions.push({ id: "vp", discipline_id: "pen", status: "published" }, { id: "vc", discipline_id: "civ", status: "published" });
  db.tables.sections.push(
    { id: "sp2", version_id: "vp", position: 2, numbering: "1.1", title: "Homicídio", path: ["CRIMES"] },
    { id: "sp1", version_id: "vp", position: 1, numbering: "1", title: "CRIMES", path: [] },
    { id: "sc1", version_id: "vc", position: 1, numbering: "1", title: "CONTRATOS", path: [] },
  );
  db.tables.paragraphs.push(
    { id: "pp1", section_id: "sp1", version_id: "vp", position: 1 }, { id: "pp2", section_id: "sp1", version_id: "vp", position: 2 },
    { id: "pp3", section_id: "sp2", version_id: "vp", position: 1 }, { id: "pc1", section_id: "sc1", version_id: "vc", position: 1 },
  );
  hl("aluno", "civ", "vc", "pc1", 0);
  hl("aluno", "pen", "vp", "pp3", 4, { color: "revisar", reviewed_at: "2026-10-20T00:00:00Z", note: "cai muito" });
  hl("aluno", "pen", "vp", "pp2", 9);
  hl("aluno", "pen", "vp", "pp2", 1, { color: "lei_seca" });
  hl("aluno", "pen", "old", "old-p", 0, { status: "orphaned", orphaned_at: "2026-10-21T15:00:00Z" });
  hl("outro", "pen", "vp", "pp1", 0);
});

describe("loadNotebook", () => {
  it("agrupa por disciplina e caminho da seção, na ordem do material", async () => {
    const notebook = await loadNotebook(sb(), "aluno", {});
    expect(notebook.map((group) => group.discipline.slug)).toEqual(["penal", "civil"]);
    const penal = notebook[0];
    expect(penal.topics.map((topic) => topic.path)).toEqual([["CRIMES"], ["CRIMES", "Homicídio"], [ORPHAN_TOPIC]]);
    expect(penal.topics[0].items.map((item) => item.id)).toEqual(["h4", "h3"]);
    expect(penal.topics[1].items[0]).toMatchObject({ id: "h2", note: "cai muito", reviewed: true, color: "revisar", sectionId: "sp2", disciplineSlug: "penal" });
  });
  it("órfãos ficam no fim, com a data da atualização", async () => {
    const orphan = (await loadNotebook(sb(), "aluno", {}))[0].topics[2].items[0];
    expect(orphan).toMatchObject({ id: "h5", orphaned: true, orphanedAt: "2026-10-21T15:00:00Z", sectionId: null });
  });
  it("filtra por disciplina, cor e estado de revisão", async () => {
    const ids = async (filter: Parameters<typeof loadNotebook>[2]) => (await loadNotebook(sb(), "aluno", filter)).flatMap((group) => group.topics.flatMap((topic) => topic.items.map((item) => item.id)));
    expect(await ids({ disciplines: ["civil"] })).toEqual(["h1"]);
    expect(await ids({ colors: ["lei_seca", "revisar"] })).toEqual(["h4", "h2"]);
    expect(await ids({ reviewed: "done" })).toEqual(["h2"]);
    expect(await ids({ reviewed: "pending", disciplines: ["penal"] })).toEqual(["h4", "h3", "h5"]);
  });
  it("grifos de outros alunos nunca aparecem", async () => {
    const all = (await loadNotebook(sb(), "aluno", {})).flatMap((group) => group.topics.flatMap((topic) => topic.items.map((item) => item.id)));
    expect(all).not.toContain("h6");
    expect(all).toHaveLength(5);
  });
});
