import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightLayer } from "@/components/reader/HighlightLayer";

describe("tabela desenhada no leitor", () => {
  it("vira <table> com cabeçalho, e o texto do parágrafo no DOM é exatamente o guardado (grifos usam esses deslocamentos)", () => {
    const text = "Elemento | Vício\nCompetência | Em regra, sanável\nFinalidade | Insanável";
    const html = renderToStaticMarkup(createElement(HighlightLayer, { versionId: "v", sectionId: "s", paragraphs: [{ id: "p1", kind: "table", text }] }));
    expect(html).toContain("<table");
    expect(html).toMatch(/<th>(<span[^>]*>)?Elemento/);
    expect(html).toContain("<br/>");
    const cell = /<div[^>]*data-paragraph-id="p1"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
    const domText = cell.replace(/<br\/>/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
    expect(domText).toBe(text);
  });
  it("seções seguintes da mesma página ganham título próprio antes do primeiro parágrafo", () => {
    const html = renderToStaticMarkup(createElement(HighlightLayer, { versionId: "v", sectionId: "s1", paragraphs: [{ id: "a", kind: "body", text: "Art. 1º Texto." }, { id: "b", kind: "body", text: "Art. 2º Outro." }], breaks: { b: [{ sectionId: "s2", label: "Art. 2º" }] } }));
    expect(html).toContain('<h2 class="section-subhead" id="s-s2">Art. 2º</h2>');
  });
});
