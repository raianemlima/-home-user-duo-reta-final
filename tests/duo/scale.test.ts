import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnchor } from "@/lib/highlights/anchor";
import { reanchor } from "@/lib/highlights/reanchor";
import type { ParagraphRef, VersionText } from "@/lib/highlights/types";
import { loadNotebook } from "@/lib/notebook/queries";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";

// Fiscaliza o tamanho dos filtros in(...): cada valor vira parte da URL do PostgREST.
function spying(db: FakeDb, user: string) {
  const base = makeFakeSupabase(db, user);
  const sizes: number[] = [];
  return { sizes, client: { ...base, from: (table: string) => { const query = base.from(table) as unknown as { in: (column: string, values: unknown[]) => unknown }; const original = query.in.bind(query); query.in = (column, values) => { sizes.push(values.length); return original(column, values); }; return query; } } };
}

describe("escala da reancoragem", () => {
  it("3000 grifos numa disciplina de 1500 parágrafos editada reancoram em menos de 3 s", () => {
    const words = ["defensoria", "pública", "assistência", "jurídica", "integral", "gratuita", "necessitados", "autonomia", "funcional", "orçamentária"];
    const paragraph = (i: number, edited = false): ParagraphRef => {
      const text = `${edited ? "Atualizado: " : ""}Parágrafo ${i} trata de ${Array.from({ length: 40 }, (_, k) => words[(i * 7 + k) % words.length]).join(" ")} item ${i}.`;
      return { id: `${edited ? "n" : "o"}${i}`, sectionId: `s${Math.floor(i / 20)}`, sectionPath: [`Seção ${Math.floor(i / 20)}`], position: i % 20, hash: `${edited}-${i}`, text };
    };
    const oldDoc: VersionText = { paragraphs: Array.from({ length: 1500 }, (_, i) => paragraph(i)) };
    const newDoc: VersionText = { paragraphs: Array.from({ length: 1500 }, (_, i) => paragraph(i, i % 2 === 0)) };
    const highlights = Array.from({ length: 3000 }, (_, i) => { const target = oldDoc.paragraphs[(i * 13) % 1500]; return { id: `g${i}`, anchor: createAnchor(oldDoc, { paragraphId: target.id, offset: 0 }, { paragraphId: target.id, offset: 30 }) }; });
    const started = performance.now();
    const results = reanchor(highlights, oldDoc, newDoc);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(results.filter((result) => result.status === "active").length).toBeGreaterThan(2900);
  }, 60_000);
});

describe("filtros in(...) limitados", () => {
  let db: FakeDb;
  beforeEach(() => { db = new FakeDb(); });
  it("caderno com 450 grifos consulta parágrafos em lotes de até 100", async () => {
    db.tables.disciplines.push({ id: "d", slug: "penal", title: "Penal", position: 1 });
    for (let i = 0; i < 450; i += 1) {
      db.tables.paragraphs.push({ id: `p${i}`, section_id: `s${i}`, version_id: "v", position: 1 });
      db.tables.sections.push({ id: `s${i}`, version_id: "v", position: i, title: `S${i}`, path: [] });
      db.tables.highlights.push({ id: `h${i}`, user_id: "u", discipline_id: "d", start_paragraph_id: `p${i}`, start_offset: 0, quote: "q", note: null, color: "importante", status: "active", orphaned_at: null, reviewed_at: null });
    }
    const { sizes, client } = spying(db, "u");
    const notebook = await loadNotebook(client as never, "u", {});
    expect(notebook[0].topics).toHaveLength(450);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
  });
  it("lista de 250 e-mails confere cadastros em lotes de até 100", async () => {
    vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
    vi.stubEnv("ALUNO_SENHA_PADRAO", "senha-de-teste");
    const { sizes, client } = spying(db, "equipe");
    vi.doMock("@/lib/server/auth", () => ({ requireStaff: async () => ({ supabase: client, user: { id: "equipe" } }) }));
    vi.doMock("@/lib/server/admin", () => ({ createAdminClient: () => ({ auth: { admin: { createUser: async ({ email }: { email: string }) => ({ data: { user: { id: `id-${email}` } }, error: null }) } } }) }));
    const { POST } = await import("@/app/api/equipe/alunos/route");
    const list = Array.from({ length: 250 }, (_, i) => `aluno${i}@exemplo.com`).join("\n");
    const response = await POST(new Request("http://x/api/equipe/alunos", { method: "POST", body: JSON.stringify({ list }) }));
    expect((await response.json()).invited).toHaveLength(250);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
    vi.doUnmock("@/lib/server/auth"); vi.doUnmock("@/lib/server/admin");
  });
});
