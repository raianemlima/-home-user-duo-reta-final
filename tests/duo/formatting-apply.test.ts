import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";
import { samplePdf } from "../formatting-sample";

const staff = vi.fn();
const download = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStaff: () => staff() }));
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ download }) } }) }));
import { POST } from "@/app/api/equipe/formatacao/route";

const VER = "f1000000-0000-4000-8000-000000000001";
let db: FakeDb; let saved: { p_version_id: string; p_formats: Record<string, unknown> } | null; let rpcError: { code?: string; message: string } | null;
const call = (body: unknown) => POST(new Request("http://x/api/equipe/formatacao", { method: "POST", body: JSON.stringify(body) }));

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  db = new FakeDb(); saved = null; rpcError = null;
  db.tables.content_versions.push({ id: VER, discipline_id: "d1", status: "published", source_path: "u/const.pdf" });
  // Seções fora de ordem no banco: a aplicação lê na ordem do material.
  db.tables.sections.push({ id: "s2", version_id: VER, position: 2 }, { id: "s1", version_id: VER, position: 1 });
  db.tables.paragraphs.push(
    { id: "p2", section_id: "s2", version_id: VER, position: 1, kind: "body", text: "Repare no sistema tripartite da teoria do crime." },
    { id: "p1", section_id: "s1", version_id: VER, position: 1, kind: "body", text: "A nacionalidade diz respeito ao vinculo juridico-politico entre pessoa e Estado." },
    { id: "p3", section_id: "s2", version_id: VER, position: 2, kind: "body", text: "Linha comum de corpo numero 1 para firmar a margem." },
  );
  const fake = makeFakeSupabase(db, "equipe");
  staff.mockResolvedValue({ supabase: { ...fake, rpc: async (name: string, args: typeof saved) => { if (rpcError) return { data: null, error: rpcError }; if (name === "set_paragraph_formats") saved = args; return { data: Object.keys(args?.p_formats ?? {}).length, error: null }; } }, user: { id: "equipe" } });
  download.mockResolvedValue({ data: new Blob([await samplePdf() as BlobPart]), error: null });
});

describe("POST /api/equipe/formatacao", () => {
  it("lê o PDF original, encaixa e grava a formatação da versão numa chamada", async () => {
    const response = await call({ versionId: VER });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ formatted: 2, matched: 3, total: 3 });
    expect(download).toHaveBeenCalledWith("u/const.pdf");
    expect(saved).toEqual({ p_version_id: VER, p_formats: { p1: { m: [[32, 57, "b"]] }, p2: { m: [[10, 28, "u"]] } } });
  });
  it("ebook em Word: não lê arquivo nem grava nada", async () => {
    db.tables.content_versions[0].source_path = "u/vade.docx";
    expect(await (await call({ versionId: VER })).json()).toEqual({ formatted: 0, matched: 0, total: 3, skipped: "not_pdf" });
    expect(download).not.toHaveBeenCalled();
    expect(saved).toBeNull();
  });
  it("banco sem a migração 0023: 503 com orientação", async () => {
    rpcError = { code: "PGRST202", message: "Could not find the function public.set_paragraph_formats" };
    const response = await call({ versionId: VER });
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toMatch(/migração 0023/);
  });
  it("versão inválida: 400", async () => {
    expect((await call({ versionId: "x" })).status).toBe(400);
  });
});
