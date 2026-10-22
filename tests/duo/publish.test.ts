import { beforeEach, describe, expect, it, vi } from "vitest";
import { paragraphHash } from "@/lib/content/build";
import { publishVersion } from "@/lib/content/repository";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";

const staff = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStaff: () => staff(), requireUser: () => staff() }));
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => makeFakeSupabase(db, "service") }));

import { DELETE as deleteVersion } from "@/app/api/equipe/versoes/[id]/route";
import { POST as publishRoute } from "@/app/api/equipe/versoes/[id]/publicar/route";
import { POST as createVersion } from "@/app/api/equipe/versoes/route";
import { ApiError } from "@/lib/server/http";

const DISC = "f0000000-0000-4000-8000-000000000001";
const OLD = "f1000000-0000-4000-8000-000000000001", NEW = "f1000000-0000-4000-8000-000000000002";
let db: FakeDb;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function seedVersion(id: string, status: string, texts: string[]) {
  db.tables.content_versions.push({ id, discipline_id: DISC, label: id, source_sha256: "h", status, published_at: status === "published" ? "2026-07-29T00:00:00Z" : null });
  db.tables.sections.push({ id: `${id}-s1`, version_id: id, position: 1, level: 1, numbering: "1", title: "MODELOS", path: [] });
  texts.forEach((text, i) => db.tables.paragraphs.push({ id: `${id}-p${i + 1}`, section_id: `${id}-s1`, version_id: id, position: i + 1, kind: "body", text, hash: paragraphHash(text) }));
}
function seedHighlight(id: string, user: string, paragraph: string, start: number, end: number, quote: string, prefix = "", suffix = "") {
  db.tables.highlights.push({ id, user_id: user, discipline_id: DISC, version_id: OLD, start_paragraph_id: paragraph, start_offset: start, end_paragraph_id: paragraph, end_offset: end, quote, prefix, suffix, color: "importante", note: null, status: "active", orphaned_at: null, reviewed_at: null });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  db = new FakeDb();
  seedVersion(OLD, "published", ["O modelo judicare paga advogados particulares.", "O modelo caritativo é pro bono."]);
  seedVersion(NEW, "draft", ["Novo parágrafo inicial.", "O modelo judicare paga advogados particulares."]);
  seedHighlight("g1", "aluno-a", `${OLD}-p1`, 2, 17, "modelo judicare");
  seedHighlight("g2", "aluno-b", `${OLD}-p2`, 2, 18, "modelo caritativo");
  staff.mockResolvedValue({ supabase: makeFakeSupabase(db, "equipe"), user: { id: "equipe" } });
});

describe("publishVersion", () => {
  it("arquiva a anterior, publica a nova e reancora os grifos", async () => {
    const result = await publishVersion(makeFakeSupabase(db, "service") as never, NEW);
    expect(result).toEqual({ published: true, alreadyPublished: false, reanchored: 1, orphaned: 1 });
    const status = Object.fromEntries(db.tables.content_versions.map((row) => [row.id, row.status]));
    expect(status).toEqual({ [OLD]: "archived", [NEW]: "published" });
    const g1 = db.tables.highlights.find((row) => row.id === "g1")!;
    expect(g1).toMatchObject({ status: "active", version_id: NEW, start_paragraph_id: `${NEW}-p2`, start_offset: 2, end_offset: 17, quote: "modelo judicare" });
    const g2 = db.tables.highlights.find((row) => row.id === "g2")!;
    expect(g2.status).toBe("orphaned");
    expect(g2.orphaned_at).toEqual(expect.any(String));
    expect(g2.quote).toBe("modelo caritativo");
  });

  it("publicar duas vezes é idempotente e não reancora de novo", async () => {
    await publishVersion(makeFakeSupabase(db, "service") as never, NEW);
    const snapshot = JSON.stringify(db.tables.highlights);
    const again = await publishVersion(makeFakeSupabase(db, "service") as never, NEW);
    expect(again).toEqual({ published: true, alreadyPublished: true, reanchored: 0, orphaned: 0 });
    expect(JSON.stringify(db.tables.highlights)).toBe(snapshot);
  });

  it("primeira publicação de uma disciplina não tem grifos a reancorar", async () => {
    db.tables.content_versions = db.tables.content_versions.filter((row) => row.id !== OLD);
    db.tables.highlights = [];
    expect(await publishVersion(makeFakeSupabase(db, "service") as never, NEW)).toEqual({ published: true, alreadyPublished: false, reanchored: 0, orphaned: 0 });
  });
});

describe("rotas da equipe para versões", () => {
  it("publicar pela rota devolve o resumo", async () => {
    const response = await publishRoute(new Request("http://x", { method: "POST" }), ctx(NEW));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reanchored: 1, orphaned: 1 });
  });

  it("não é possível apagar uma versão publicada", async () => {
    const response = await deleteVersion(new Request("http://x", { method: "DELETE" }), ctx(OLD));
    expect(response.status).toBe(409);
    expect(db.tables.content_versions).toHaveLength(2);
  });

  it("rascunho pode ser descartado", async () => {
    const response = await deleteVersion(new Request("http://x", { method: "DELETE" }), ctx(NEW));
    expect(response.status).toBe(200);
    expect(db.tables.content_versions.map((row) => row.id)).toEqual([OLD]);
  });

  it("aluno chamando rota da equipe recebe 403", async () => {
    staff.mockRejectedValue(new ApiError(403, "forbidden", "Acesso restrito à equipe."));
    const response = await publishRoute(new Request("http://x", { method: "POST" }), ctx(NEW));
    expect(response.status).toBe(403);
    expect(db.tables.content_versions.find((row) => row.id === NEW)?.status).toBe("draft");
  });
});

describe("criar rascunho a partir do job de ingestão", () => {
  const JOB = "c0000000-0000-4000-8000-0000000000a1", DOC = "d0000000-0000-4000-8000-0000000000a1";
  async function seedJob(status: string) {
    const { readFileSync } = await import("node:fs");
    const { cleanDocument } = await import("@/lib/cleaning/clean");
    const { extractOriginal } = await import("@/lib/extraction");
    const { segmentDocument } = await import("@/lib/segmentation/segment");
    const extraction = await extractOriginal("pdf", new Uint8Array(readFileSync("tests/golden/pdfs/19-duo-ebook.pdf")));
    const segmentation = segmentDocument(DOC, "sha-ebook", cleanDocument(extraction, { mode: "faithful" }).paragraphs);
    db.tables.documents.push({ id: DOC, owner_id: "equipe", sha256: "sha-ebook" });
    db.tables.jobs.push({ id: JOB, owner_id: "equipe", notebook_id: "nb", status });
    db.tables.job_stages.push({ id: "st", owner_id: "equipe", job_id: JOB, stage: "segmentation", subject_id: DOC, status: "succeeded", output: segmentation });
  }
  const create = (body: unknown) => createVersion(new Request("http://x/api/equipe/versoes", { method: "POST", body: JSON.stringify(body) }));

  it("grava seções e parágrafos do ebook como rascunho", async () => {
    await seedJob("succeeded");
    const response = await create({ disciplineId: DISC, jobId: JOB, label: "Atualizado em 21/10/2026" });
    expect(response.status).toBe(201);
    const { versionId } = await response.json();
    expect(db.tables.content_versions.find((row) => row.id === versionId)).toMatchObject({ status: "draft", source_sha256: "sha-ebook", job_id: JOB, label: "Atualizado em 21/10/2026" });
    expect(db.tables.sections.filter((row) => row.version_id === versionId).length).toBeGreaterThanOrEqual(3);
    expect(db.tables.paragraphs.some((row) => row.version_id === versionId && row.kind === "tip")).toBe(true);
  });

  it("job ainda em andamento é recusado com 409", async () => {
    await seedJob("running");
    expect((await create({ disciplineId: DISC, jobId: JOB, label: "x" })).status).toBe(409);
  });

  it("rótulo longo demais ou ids inválidos: 400 (rótulo vazio vira a data do material)", async () => {
    await seedJob("succeeded");
    expect((await create({ disciplineId: DISC, jobId: JOB, label: "x".repeat(121) })).status).toBe(400);
    expect((await create({ disciplineId: "x", jobId: JOB, label: "ok" })).status).toBe(400);
  });
});
