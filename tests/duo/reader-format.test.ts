import { describe, expect, it } from "vitest";
import { cleanDocument } from "@/lib/cleaning/clean";
import { markLead, paragraphFormat } from "@/lib/reader/format";
import type { DocumentExtraction, LayoutBlock } from "@/lib/extraction/types";

describe("formatação de texto jurídico", () => {
  it("reconhece artigo, parágrafo, inciso, alínea e item", () => {
    expect(paragraphFormat("Art. 5º Todos são iguais.", "body")).toEqual({ className: "para-article", lead: "Art. 5º".length });
    expect(paragraphFormat("§ 1º O prazo é de dez dias.", "body").className).toBe("para-par");
    expect(paragraphFormat("Parágrafo único. Vale também.", "body").className).toBe("para-par");
    expect(paragraphFormat("IV - a defesa;", "body")).toEqual({ className: "para-inciso", lead: 4 });
    expect(paragraphFormat("a) o primeiro", "body").className).toBe("para-alinea");
    expect(paragraphFormat("1. Primeiro ponto", "body").className).toBe("para-item");
    expect(paragraphFormat("Texto comum do ebook.", "body")).toEqual({ className: "", lead: 0 });
    expect(paragraphFormat("Art. 5º Todos", "footnote")).toEqual({ className: "", lead: 0 });
  });
  it("destaca só o rótulo, sem alterar o texto", () => {
    const segments = markLead([{ text: "Art. 5º Todos são iguais." }], 7);
    expect(segments).toEqual([{ text: "Art. 5º", lead: true }, { text: " Todos são iguais.", lead: false }]);
    expect(segments.map((segment) => segment.text).join("")).toBe("Art. 5º Todos são iguais.");
  });
  it("rótulo atravessando um grifo corta o trecho em dois", () => {
    const segments = markLead([{ text: "Art. 5º Todos", marks: ["a"] }, { text: " iguais", marks: [] }], 4);
    expect(segments.map((segment) => [segment.text, segment.lead])).toEqual([["Art.", true], [" 5º Todos", false], [" iguais", false]]);
  });
});

const block = (text: string): LayoutBlock => ({ kind: "body", text, fontSize: 11, y: 500, column: null, heading: false, source: "text-layer" });
const extraction = (...pages: string[][]): DocumentExtraction => ({ pages: pages.map((texts, index) => ({ page: index + 1, blocks: texts.map(block) })), warnings: [] } as unknown as DocumentExtraction);

describe("frase quebrada no meio do parágrafo", () => {
  it("junta continuação em minúscula na mesma página", () => {
    const result = cleanDocument(extraction(["Pela teoria finalista de Welzel, o elemento subjetivo está na conduta, de forma que", "a ausência de dolo torna o fato atípico."]), { mode: "faithful" });
    expect(result.paragraphs.map((paragraph) => paragraph.text)).toEqual(["Pela teoria finalista de Welzel, o elemento subjetivo está na conduta, de forma que a ausência de dolo torna o fato atípico."]);
  });
  it("não junta alínea nem frase já terminada", () => {
    const result = cleanDocument(extraction(["São requisitos:", "a) o primeiro", "Fim da frase.", "outro texto solto"]), { mode: "faithful" });
    expect(result.paragraphs).toHaveLength(4);
  });
});
