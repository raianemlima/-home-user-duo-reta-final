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
import { POST as createVersion } from "@/app/api/equipe/versoes/route";
import { GET as previewVersion } from "@/app/api/equipe/versoes/[id]/route";
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

    const draft = await createVersion(json("/api/equipe/versoes", { disciplineId: discipline.id, jobId: view.job.id, label: "Atualizado em 29/07/2026" }));
    expect(draft.status).toBe(201);
    const { versionId } = await draft.json();

    const preview = await (await previewVersion(new Request("http://x"), ctx(versionId))).json();
    expect(preview.stats).toMatchObject({ sections: 5, tips: 1 });
    expect(preview.toc.map((item: { numbering: string | null }) => item.numbering)).toEqual([null, "1", "1.1", "1.2", "2"]);
    expect(preview.sample[0].paragraphs[0]).toContain("DICA DUO");

    expect((await publish(new Request("http://x", { method: "POST" }), ctx(versionId))).status).toBe(200);
    const list = await (await listDisciplines()).json();
    expect(list.disciplines[0]).toMatchObject({ slug: "penal", published: { id: versionId, label: "Atualizado em 29/07/2026" }, drafts: [] });

    const sectionId = preview.toc[2].id;
    const reader = await loadSection(makeFakeSupabase(db, "aluno") as never, "penal", sectionId);
    expect(reader?.section.paragraphs.map((paragraph) => paragraph.text).join(" ")).toContain("Os critérios de atendimento");
  });

  it("disciplina: slug inválido ou repetido é recusado", async () => {
    expect((await createDiscipline(json("/api/equipe/disciplinas", { title: "X", slug: "Direito Penal!" }))).status).toBe(400);
    await createDiscipline(json("/api/equipe/disciplinas", { title: "Penal", slug: "penal" }));
    expect((await createDiscipline(json("/api/equipe/disciplinas", { title: "Penal 2", slug: "penal" }))).status).toBe(409);
  });
});
