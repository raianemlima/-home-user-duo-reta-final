import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNotebookExport, MAX_EXPORT_ITEMS } from "@/lib/export/model";
import JSZip from "jszip";
import { renderDocx } from "@/lib/export/docx";
import { renderPdf } from "@/lib/export/pdf";
import { extractOriginal } from "@/lib/extraction";
import type { NotebookGroup, NotebookItem } from "@/lib/notebook/queries";

const item = (id: string, extra: Partial<NotebookItem> = {}): NotebookItem => ({ id, quote: `Trecho ${id}`, note: null, color: "importante", reviewed: false, orphaned: false, orphanedAt: null, disciplineSlug: "penal", disciplineTitle: "Direito Penal", sectionId: "s1", paragraphId: "p1", sectionPath: ["CRIMES", "Homicídio"], order: [1, 1, 0], ...extra });
const notebook: NotebookGroup[] = [{ discipline: { slug: "penal", title: "Direito Penal" }, topics: [
  { path: ["CRIMES", "Homicídio"], items: [item("a", { note: "cai muito" }), item("b", { color: "revisar" })] },
  { path: ["Trechos alterados na atualização"], items: [item("c", { orphaned: true, orphanedAt: "2026-10-21T15:00:00Z", sectionId: null, sectionPath: ["Trechos alterados na atualização"] })] },
] }];
const NOW = new Date("2026-10-22T13:00:00Z");

describe("buildNotebookExport", () => {
  it("monta o modelo na ordem do material, com referências", () => {
    const doc = buildNotebookExport(notebook, "ana@x.com", NOW);
    expect(doc).toMatchObject({ title: "Caderno de revisão", subtitle: "Reta Final DPE-SP", generatedAt: "22/10/2026" });
    expect(doc.disciplines[0].title).toBe("Direito Penal");
    expect(doc.disciplines[0].topics[0]).toMatchObject({ heading: "CRIMES › Homicídio" });
    expect(doc.disciplines[0].topics[0].items.map((entry) => [entry.quote, entry.note, entry.reference])).toEqual([["Trecho a", "cai muito", "Direito Penal › CRIMES › Homicídio"], ["Trecho b", null, "Direito Penal › CRIMES › Homicídio"]]);
  });
  it("rodapé leva o e-mail do aluno", () => {
    expect(buildNotebookExport(notebook, "ana@x.com", NOW).footer).toBe("Cursos DUO · Reta Final DPE-SP · uso pessoal de ana@x.com");
  });
  it("trecho órfão leva o aviso com a data", () => {
    const orphan = buildNotebookExport(notebook, "ana@x.com", NOW).disciplines[0].topics[1].items[0];
    expect(orphan.orphanedNotice).toBe("Este trecho mudou na atualização de 21/10.");
    expect(orphan.reference).toBe("Direito Penal");
  });
});

describe("renderPdf", () => {
  it("gera um PDF válido com emoji e anotação de 2000 caracteres", async () => {
    const heavy: NotebookGroup[] = [{ ...notebook[0], topics: [{ path: ["CRIMES"], items: [item("x", { quote: "Súmula 😀 vinculante “aspas” — travessão", note: "n".repeat(2000) })] }] }];
    const bytes = await renderPdf(buildNotebookExport(heavy, "ana@x.com", NOW));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const text = (await extractOriginal("pdf", bytes)).pages.flatMap((page) => page.blocks.map((block) => block.text)).join("\n");
    expect(text).toContain("Caderno de revisão");
    expect(text).toContain("ana@x.com");
    expect(text).toContain("Súmula");
    expect(text).toContain("vinculante");
  }, 60_000);
});

describe("renderDocx", () => {
  it("gera um .docx válido com título, trechos, anotação e rodapé", async () => {
    const bytes = await renderDocx(buildNotebookExport(notebook, "ana@x.com", NOW));
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe("PK");
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")?.async("string");
    expect(xml).toContain("Caderno de revisão");
    expect(xml).toContain("Trecho a");
    expect(xml).toContain("cai muito");
    expect(xml).toContain("Arial");
    const footer = Object.keys(zip.files).find((name) => /^word\/footer\d*\.xml$/.test(name));
    expect(await zip.file(footer as string)?.async("string")).toContain("ana@x.com");
  });
});

const student = vi.fn();
const load = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
vi.mock("@/lib/notebook/queries", async (original) => ({ ...(await original<typeof import("@/lib/notebook/queries")>()), loadNotebook: (...args: unknown[]) => load(...args) }));
import { GET as exportRoute } from "@/app/api/caderno/exportar/route";

describe("GET /api/caderno/exportar", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
    student.mockResolvedValue({ supabase: {}, user: { id: "u", email: "ana@x.com" }, profile: { role: "aluno", active: true } });
  });
  it("devolve o PDF como anexo, repassando os filtros", async () => {
    load.mockResolvedValue(notebook);
    const response = await exportRoute(new Request("http://x/api/caderno/exportar?disciplinas=penal&cores=revisar,roxo&revisados=pending"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="caderno-duo-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect(load).toHaveBeenCalledWith({}, "u", { disciplines: ["penal"], colors: ["revisar"], reviewed: "pending" });
  }, 60_000);
  it("formato=docx devolve o Word como anexo", async () => {
    load.mockResolvedValue(notebook);
    const response = await exportRoute(new Request("http://x/api/caderno/exportar?disciplinas=penal&formato=docx"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="caderno-duo-\d{4}-\d{2}-\d{2}\.docx"$/);
  });
  it("caderno acima do limite: 413 com orientação", async () => {
    load.mockResolvedValue([{ ...notebook[0], topics: [{ path: ["X"], items: Array.from({ length: MAX_EXPORT_ITEMS + 1 }, (_, i) => item(`i${i}`)) }] }]);
    const response = await exportRoute(new Request("http://x/api/caderno/exportar"));
    expect(response.status).toBe(413);
    expect((await response.json()).error.message).toBe("Seu caderno ficou grande demais para um arquivo só. Filtre por disciplina e exporte em partes.");
  });
  it("caderno vazio: 404", async () => {
    load.mockResolvedValue([]);
    expect((await exportRoute(new Request("http://x/api/caderno/exportar"))).status).toBe(404);
  });
});
