import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanDocument } from "@/lib/cleaning/clean";
import { buildDraft, draftToVersionText } from "@/lib/content/build";
import { extractOriginal } from "@/lib/extraction";
import { segmentDocument } from "@/lib/segmentation/segment";
import { CORPUS_DIR } from "../helpers";

async function draft() {
  const extraction = await extractOriginal("pdf", new Uint8Array(readFileSync(join(CORPUS_DIR, "19-duo-ebook.pdf"))));
  return buildDraft(segmentDocument("d1", "sha", cleanDocument(extraction, { mode: "faithful" }).paragraphs));
}

describe("buildDraft", () => {
  it("seções seguem a numeração do ebook", async () => {
    const sections = await draft();
    const titled = sections.filter((section) => section.title);
    expect(titled.map((section) => [section.numbering, section.title])).toEqual([["1.", "MODELOS DE ASSISTÊNCIA JURÍDICA GRATUITA"], ["1.1", "Critérios para atendimento pela DPE-SP"], ["1.2", "Exceções ao critério de renda"], ["2.", "AUTONOMIA DA DEFENSORIA PÚBLICA"]]);
    expect(titled[1].level).toBeGreaterThan(titled[0].level);
    expect(titled[1].path).toEqual(["MODELOS DE ASSISTÊNCIA JURÍDICA GRATUITA"]);
    expect(sections.map((section) => section.position)).toEqual(sections.map((_, index) => index + 1));
  });

  it("subtítulo sutil não é emendado ao parágrafo da página seguinte", async () => {
    const exceptions = (await draft()).find((section) => section.numbering === "1.2");
    expect(exceptions?.paragraphs.map((paragraph) => paragraph.text)).toEqual(["a) entidade familiar composta por mais de cinco membros;", "b) gastos mensais comprovados com tratamento médico por doença grave."]);
  });

  it("o sumário não vira seção nem parágrafo", async () => {
    const texts = (await draft()).flatMap((section) => [section.title ?? "", ...section.paragraphs.map((paragraph) => paragraph.text)]);
    expect(texts.some((text) => /\.{5,}/.test(text))).toBe(false);
    expect(texts).not.toContain("Sumário");
  });

  it("a caixa DICA DUO fica como parágrafo tip", async () => {
    const tips = (await draft()).flatMap((section) => section.paragraphs).filter((paragraph) => paragraph.kind === "tip");
    expect(tips).toHaveLength(1);
    expect(tips[0].text.startsWith("DICA DUO")).toBe(true);
  });

  it("título sem texto próprio (\"TÍTULO IV\" logo antes do capítulo) não some do material", () => {
    const sections = buildDraft(segmentDocument("d", "s", [{ text: "TÍTULO IV", pages: [1], kind: "body", heading: true, fontSize: 15 }, { text: "Da Tutela, da Curatela", pages: [1], kind: "body", heading: true, fontSize: 15 }, { text: "CAPÍTULO I", pages: [1], kind: "body", heading: true, fontSize: 14 }, { text: "Da Tutela", pages: [1], kind: "body", heading: true, fontSize: 14 }, { text: "Art. 1.728. Os filhos menores são postos em tutela.", pages: [1], kind: "body", heading: false, fontSize: 10 }]));
    expect(sections.map((section) => [section.numbering, section.title, section.paragraphs.length])).toEqual([["TÍTULO IV", "Da Tutela, da Curatela", 0], ["CAPÍTULO I", "Da Tutela", 0], ["Art. 1.728", "Art. 1.728", 1]]);
  });

  it("hash ignora diferenças de espaço e aspas", () => {
    const segmentation = (text: string) => segmentDocument("d", "s", [{ text: "1. TÍTULO", pages: [1], kind: "body", heading: true, fontSize: 15 }, { text, pages: [1], kind: "body", heading: false, fontSize: 10 }]);
    const a = buildDraft(segmentation('O  "modelo"  público.'))[0].paragraphs[0].hash;
    const b = buildDraft(segmentation("O “modelo” público."))[0].paragraphs[0].hash;
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("draftToVersionText monta o caminho da seção com o próprio título", async () => {
    const sections = await draft();
    const doc = draftToVersionText(sections.map((section, index) => ({ ...section, id: `s${index}`, paragraphs: section.paragraphs.map((paragraph, k) => ({ ...paragraph, id: `p${index}-${k}` })) })));
    const critério = doc.paragraphs.find((paragraph) => paragraph.text.startsWith("Os critérios"));
    expect(critério?.sectionPath).toEqual(["MODELOS DE ASSISTÊNCIA JURÍDICA GRATUITA", "Critérios para atendimento pela DPE-SP"]);
  });
});
