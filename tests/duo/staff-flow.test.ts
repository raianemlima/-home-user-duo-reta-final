import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSection } from "@/lib/reader/queries";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";
import { CORPUS_DIR } from "../helpers";

const staff = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStaff: () => staff(), requireUser: () => staff() }));
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => makeFakeSupabase(db, "service") }));

import { GET as listDisciplines, POST as createDiscipline } from "@/app/api/equipe/disciplinas/route";
import { DELETE as deleteDiscipline } from "@/app/api/equipe/disciplinas/[id]/route";
import { POST as createVersion } from "@/app/api/equipe/versoes/route";
import { DELETE as deleteVersion, GET as previewVersion } from "@/app/api/equipe/versoes/[id]/route";
import { GET as versionImpact } from "@/app/api/equipe/versoes/[id]/impacto/route";
import { POST as publish } from "@/app/api/equipe/versoes/[id]/publicar/route";
import { POST as createJob } from "@/app/api/jobs/route";
import { POST as advance } from "@/app/api/jobs/[id]/advance/route";

let db: FakeDb;
const DOC = "d1111111-1111-4111-8111-111111111111";
const json = (url: string, body: unknown) => new Request(`http://x${url}`, { method: "POST", body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  db = new FakeDb();
  staff.mockResolvedValue({ supabase: makeFakeSupabase(db, "equipe"), user: { id: "equipe" } });
  const path = `equipe/${DOC}/original.pdf`;
  db.tables.documents.push({ id: DOC, owner_id: "equipe", title: "Ebook Penal", format: "pdf", sha256: "sha-penal", extraction_status: "text", page_texts: [], page_count: 4, storage_path: path });
  db.objects.set(path, new Uint8Array(readFileSync(join(CORPUS_DIR, "19-duo-ebook.pdf"))));
});

describe("fluxo da equipe: ebook → rascunho → publicação → leitura", () => {
  it("publica o ebook e o aluno lê a seção 1.1", async () => {
    const created = await createDiscipline(json("/api/equipe/disciplinas", { title: "Direito Penal", slug: "penal" }));
    expect(created.status).toBe(201);
    const { discipline } = await created.json();

    const { view } = await (await createJob(json("/api/jobs", { name: "Direito Penal", documentIds: [DOC] }))).json();
    let outcome = "";
    for (let i = 0; i < 10 && outcome !== "done" && outcome !== "failed"; i += 1) outcome = (await (await advance(new Request("http://x", { method: "POST" }), ctx(view.job.id))).json()).outcome.kind;
    expect(outcome).toBe("done");

    // Rótulo em branco: a data vem do rodapé do e-book ("Atualizado em 29/07/2026"), não da data de hoje.
    const draft = await createVersion(json("/api/equipe/versoes", { disciplineId: discipline.id, jobId: view.job.id, label: "" }));
    expect(draft.status).toBe(201);
    const { versionId } = await draft.json();

    const preview = await (await previewVersion(new Request("http://x"), ctx(versionId))).json();
    expect(preview.stats).toMatchObject({ sections: 5, tips: 1 });
    expect(preview.toc.map((item: { numbering: string | null }) => item.numbering)).toEqual([null, "1.", "1.1", "1.2", "2."]);
    expect(preview.sample[0].paragraphs[0]).toContain("DICA DUO");

    expect((await publish(new Request("http://x", { method: "POST" }), ctx(versionId))).status).toBe(200);
    const list = await (await listDisciplines()).json();
    expect(list.disciplines[0]).toMatchObject({ slug: "penal", published: { id: versionId, label: "Atualizado em 29/07/2026" }, drafts: [] });

    const sectionId = preview.toc[2].id;
    const reader = await loadSection(makeFakeSupabase(db, "aluno") as never, "penal", sectionId);
    expect([reader?.section, ...(reader?.more ?? [])].flatMap((section) => section?.paragraphs ?? []).map((paragraph) => paragraph.text).join(" ")).toContain("Os critérios de atendimento");

    // Excluir o material publicado: pede confirmação, mostra o impacto e apaga a versão e os grifos dela.
    db.tables.highlights.push({ id: "g1", user_id: "aluno-1", version_id: versionId, status: "active" }, { id: "g2", user_id: "aluno-2", version_id: versionId, status: "active" }, { id: "g3", user_id: "aluno-1", version_id: "outra", status: "active" });
    expect(await (await versionImpact(new Request("http://x"), ctx(versionId))).json()).toEqual({ highlights: 2, students: 2 });
    expect((await deleteVersion(new Request(`http://x/api/equipe/versoes/${versionId}`, { method: "DELETE" }), ctx(versionId))).status).toBe(409);
    const removed = await deleteVersion(new Request(`http://x/api/equipe/versoes/${versionId}?confirmar=publicado`, { method: "DELETE" }), ctx(versionId));
    expect(await removed.json()).toEqual({ deleted: true, highlightsRemoved: 2 });
    expect(db.tables.highlights.map((row) => row.id)).toEqual(["g3"]);
    expect(db.tables.sections.filter((row) => row.version_id === versionId)).toHaveLength(0);
    expect((await (await listDisciplines()).json()).disciplines[0].published).toBeNull();
    expect(await loadSection(makeFakeSupabase(db, "aluno") as never, "penal", sectionId)).toBeNull();
  });

  it("exclui disciplina sem material publicado, com os rascunhos; com publicado ou do Vade, recusa", async () => {
    const { discipline } = await (await createDiscipline(json("/api/equipe/disciplinas", { title: "Direito Penal", slug: "direito-penal" }))).json();
    db.tables.content_versions.push({ id: "v-draft", discipline_id: discipline.id, status: "draft", label: "r" }, { id: "v-pub", discipline_id: "outra", status: "published", label: "p" });
    db.tables.sections.push({ id: "s1", version_id: "v-draft" });
    const removed = await deleteDiscipline(new Request("http://x", { method: "DELETE" }), ctx(discipline.id));
    expect(await removed.json()).toEqual({ deleted: true, draftsRemoved: 1 });
    expect(db.tables.disciplines).toHaveLength(0);
    expect(db.tables.content_versions.map((row) => row.id)).toEqual(["v-pub"]);
    expect(db.tables.sections).toHaveLength(0);

    const { discipline: published } = await (await createDiscipline(json("/api/equipe/disciplinas", { title: "Civil", slug: "civil" }))).json();
    db.tables.content_versions.push({ id: "v-civil", discipline_id: published.id, status: "published", label: "p" });
    expect((await deleteDiscipline(new Request("http://x", { method: "DELETE" }), ctx(published.id))).status).toBe(409);
    const { discipline: vade } = await (await createDiscipline(json("/api/equipe/disciplinas", { title: "Vade", slug: "vade-esperto-penal" }))).json();
    expect((await deleteDiscipline(new Request("http://x", { method: "DELETE" }), ctx(vade.id))).status).toBe(409);
    expect(db.tables.disciplines).toHaveLength(2);
  });

  it("disciplina: slug inválido ou repetido é recusado", async () => {
    expect((await createDiscipline(json("/api/equipe/disciplinas", { title: "X", slug: "Direito Penal!" }))).status).toBe(400);
    await createDiscipline(json("/api/equipe/disciplinas", { title: "Penal", slug: "penal" }));
    expect((await createDiscipline(json("/api/equipe/disciplinas", { title: "Penal 2", slug: "penal" }))).status).toBe(409);
  });
});
