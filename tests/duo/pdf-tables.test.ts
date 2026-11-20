import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import JSZip from "jszip";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightLayer } from "@/components/reader/HighlightLayer";
import { extractOriginal } from "@/lib/extraction";
import { continueTable, detectTables, resolveBreaks, vocabulary } from "@/lib/extraction/pdf-tables";
import { tableLayout } from "@/lib/reader/table";

// Tabela como o Word exporta para PDF: cada borda é um retângulo fino preenchido, e o texto de cada célula vem solto.
function rule(page: PDFPage, x0: number, y0: number, x1: number, y1: number) {
  page.drawRectangle({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, color: rgb(0, 0.3, 0) });
}
function grid(page: PDFPage, xs: number[], ys: number[], skip: (x: number, top: number, bottom: number) => boolean = () => false) {
  for (const y of ys) rule(page, xs[0], y - 0.25, xs[xs.length - 1], y + 0.25);
  for (const x of xs) for (let r = 0; r < ys.length - 1; r += 1) if (!skip(x, ys[r], ys[r + 1])) rule(page, x - 0.25, ys[r + 1], x + 0.25, ys[r]);
}
const write = (page: PDFPage, font: PDFFont, text: string, x: number, y: number, size = 10) => page.drawText(text, { x, y, size, font });
const visible = (text: string) => text.replace(/\u2028/g, " ⏎ ").replace(/\u2060/g, "∅").replace(/\u2063/g, "»").replace(/\u2062/g, "↑");

async function pdfWith(draw: (page: PDFPage, font: PDFFont) => void, pages = 1) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let n = 0; n < pages; n += 1) draw(pdf.addPage([595, 842]), font);
  return extractOriginal("pdf", new Uint8Array(await pdf.save()));
}

describe("tabela do PDF reconstruída pelas bordas", () => {
  it("cada texto vai para a sua célula, com título mesclado, quebras dentro da célula e palavra partida refeita", async () => {
    const result = await pdfWith((page, font) => {
      write(page, font, "Alguns doutrinadores dividem o constitucionalismo latino-americano em ciclos, e o ciclo multicultural vem primeiro.", 54, 700);
      // Título na largura toda (sem borda vertical no meio) e duas linhas de duas colunas.
      grid(page, [54, 152, 541], [660, 630, 560, 500], (x, top) => x === 152 && top === 660);
      write(page, font, "CICLOS DO CONSTITUCIONALISMO", 200, 642);
      write(page, font, "CICLO MULTI-", 60, 612); write(page, font, "CULTURAL", 60, 600);
      write(page, font, "Introduz o conceito de diversidade cultural, reconhece o direito", 160, 612);
      write(page, font, "à identidade cultural.", 160, 600);
      write(page, font, "Ex.: CF/88", 160, 576);
      write(page, font, "CICLO PLURINACIONAL", 60, 540);
      write(page, font, "Admite mais de uma nação dentro do Estado.", 160, 540);
      write(page, font, "Depois da tabela, o texto segue normalmente.", 54, 460);
    });
    const blocks = result.pages[0].blocks.filter((block) => block.kind === "body" || block.kind === "table");
    expect(blocks.map((block) => block.kind)).toEqual(["body", "table", "body"]);
    expect(visible(blocks[1].text)).toBe([
      "»CICLOS DO CONSTITUCIONALISMO",
      "CICLO MULTICULTURAL | Introduz o conceito de diversidade cultural, reconhece o direito à identidade cultural. ⏎ Ex.: CF/88",
      "CICLO PLURINACIONAL | Admite mais de uma nação dentro do Estado.",
    ].join("\n"));
    // O texto da tabela não aparece duas vezes (nem solto no fluxo).
    expect(blocks.filter((block) => block.text.includes("Admite mais"))).toHaveLength(1);
  });

  it("célula mesclada na vertical (sem borda horizontal sobre ela) continua a de cima", async () => {
    const result = await pdfWith((page, font) => {
      grid(page, [54, 200, 541], [700, 670, 640], () => false);
      // Apaga a borda horizontal do meio só na primeira coluna: redesenha sem ela.
      write(page, font, "ERRO DE TIPO", 60, 660);
      write(page, font, "ESSENCIAL", 210, 682); write(page, font, "ACIDENTAL", 210, 652);
    });
    // Sem mesclagem desenhada (a borda existe), são duas linhas comuns.
    expect(visible(result.pages[0].blocks.find((block) => block.kind === "table")!.text)).toBe("∅ | ESSENCIAL\nERRO DE TIPO | ACIDENTAL");

    const merged = await pdfWith((page, font) => {
      for (const y of [700, 640]) rule(page, 54, y - 0.25, 541, y + 0.25);
      rule(page, 200, 669.75, 541, 670.25); // borda do meio só na segunda coluna
      for (const x of [54, 200, 541]) rule(page, x - 0.25, 640, x + 0.25, 700);
      write(page, font, "ERRO DE TIPO", 60, 666);
      write(page, font, "ESSENCIAL", 210, 682); write(page, font, "ACIDENTAL", 210, 652);
    });
    expect(visible(merged.pages[0].blocks.find((block) => block.kind === "table")!.text)).toBe("ERRO DE TIPO | ESSENCIAL\n↑ | ACIDENTAL");
  });

  it("quadro de uma coluna e moldura da página não viram tabela", async () => {
    const result = await pdfWith((page, font) => {
      rule(page, 20, 20, 21, 822); rule(page, 574, 20, 575, 822); rule(page, 20, 20, 575, 21); rule(page, 20, 821, 575, 822);
      grid(page, [54, 541], [700, 640]);
      write(page, font, "COMO O TEMA FOI COBRADO:", 60, 680);
      write(page, font, "Julgue o item. [FCC - DPE-SP - 2023 - CERTO]", 60, 660);
    });
    expect(result.pages[0].blocks.some((block) => block.kind === "table")).toBe(false);
  });

  it("esquema desenhado com linhas (grade quase vazia) não vira tabela", () => {
    const xs = [50, 100, 150, 200, 250, 300];
    const rects = [...xs.map((x) => ({ x0: x - 0.3, y0: 400, x1: x + 0.3, y1: 600 })), ...[600, 550, 500, 450, 400].map((y) => ({ x0: 50, y0: y - 0.3, x1: 300, y1: y + 0.3 }))];
    const items = [{ text: "Zaffaroni", x: 255, y: 580, width: 40, fontSize: 9 }, { text: "Baratta", x: 105, y: 470, width: 30, fontSize: 9 }];
    expect(detectTables(items, { rects, lines: [] }, { width: 595, height: 842 }).tables).toEqual([]);
  });

  it("tabela que atravessa a página vira uma só, e a linha partida entre as páginas é remontada", async () => {
    const result = await pdfWith((page, font) => {
      const first = page.doc.getPageCount() === 1;
      if (first) {
        write(page, font, "Concepções de Constituição, em quadro comparativo:", 54, 700);
        grid(page, [54, 160, 541], [680, 650, 120]);
        write(page, font, "CONCEPÇÃO", 60, 662); write(page, font, "RESUMO", 170, 662);
        write(page, font, "SOCIOLÓGICA", 60, 632); write(page, font, "Desenvolvida por Lassale, para quem existem duas", 170, 632);
        write(page, font, "Constituições: a real e efetiva e a escrita, mera folha de", 170, 620);
      } else {
        grid(page, [54, 160, 541], [760, 730, 700]);
        write(page, font, "papel.", 170, 742);
        write(page, font, "JURÍDICA", 60, 712); write(page, font, "Desenvolvida por Kelsen.", 170, 712);
        write(page, font, "Texto depois da tabela.", 54, 660);
      }
    }, 2);
    const tables = result.pages.flatMap((page) => page.blocks.filter((block) => block.kind === "table"));
    expect(tables).toHaveLength(1);
    expect(visible(tables[0].text)).toBe([
      "CONCEPÇÃO | RESUMO",
      "SOCIOLÓGICA | Desenvolvida por Lassale, para quem existem duas Constituições: a real e efetiva e a escrita, mera folha de papel.",
      "JURÍDICA | Desenvolvida por Kelsen.",
    ].join("\n"));
  });
});

describe("junções de linha dentro da célula", () => {
  const words = vocabulary(["O ciclo multiculturalidade e o controle de constitucionalidade; Lassale e o direito."]);
  it("palavra partida só é refeita quando existe no material; hífen de verdade fica", () => {
    expect(resolveBreaks("CICLO MULTI-\u00ADCULTURAL", words)).toBe("CICLO MULTICULTURAL");
    expect(resolveBreaks("NÃO ESCRITAS-\u00ADCONSUETUDINÁRIAS", words)).toBe("NÃO ESCRITAS- CONSUETUDINÁRIAS");
    expect(resolveBreaks("insuficiên-\u00ADcia", words)).toBe("insuficiência");
    expect(resolveBreaks("não de\u2061constitucionalida\u2061de. Cabe", words)).toBe("não de constitucionalidade. Cabe");
    expect(resolveBreaks("o controle\u2061de", words)).toBe("o controle de");
  });
  it("o vocabulário não conta os pedaços em dúvida", () => {
    expect(vocabulary(["não de\u2061constitucionalida\u2061de"]).has("constitucionalida")).toBe(false);
  });
  it("continuação de tabela: cabeçalho repetido sai, título na largura toda abre outra tabela", () => {
    expect(continueTable("A | B\n1 | 2", "A | B\n3 | 4")).toBe("A | B\n1 | 2\n3 | 4");
    expect(continueTable("A | B\n1 | 2", "\u2063NOVA TABELA\nX | Y")).toBeNull();
    expect(continueTable("A | B\n1 | 2", "A | B | C\n3 | 4 | 5")).toBeNull();
    expect(continueTable("A | B\nSOCIOLÓGICA | mera folha de", "\u2060 | papel.")).toBe("A | B\nSOCIOLÓGICA | mera folha de papel.");
  });
});

describe("mesclagem vertical (rowspan)", () => {
  const text = "ERRO DE TIPO | ESSENCIAL\n\u2062 | ACIDENTAL\nOUTRO | FIM";
  it("o leitor estica a célula de cima e mantém o texto inteiro na ordem", () => {
    const rows = tableLayout(text)!;
    expect(rows[0][0].rowSpan).toBe(2);
    expect(rows[1][0].merged).toBe(true);
    expect(rows[2][0].rowSpan).toBe(1);
    expect(rows.flat().map((cell) => text.slice(cell.from, cell.sepTo)).join("")).toBe(text);
    const html = renderToStaticMarkup(createElement(HighlightLayer, { versionId: "v", sectionId: "s", paragraphs: [{ id: "p1", kind: "table", text }] }));
    expect(html).toMatch(/rowspan="2"/i);
    const cell = /<div[^>]*data-paragraph-id="p1"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
    expect(cell.replace(/<br\/>/g, "").replace(/<[^>]+>/g, "")).toBe(text);
  });
  it("Word: célula com vMerge de continuação vira a marca de mesclagem", async () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const tc = (text: string, props = "") => `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ""}<w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
    const body = `<w:tbl><w:tr>${tc("ERRO DE TIPO", '<w:vMerge w:val="restart"/>')}${tc("ESSENCIAL")}</w:tr><w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>${tc("ACIDENTAL")}</w:tr></w:tbl>`;
    const zip = new JSZip(); zip.file("word/document.xml", `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`);
    const result = await extractOriginal("docx", new Uint8Array(await zip.generateAsync({ type: "uint8array" })));
    expect(visible(result.pages[0].blocks[0].text)).toBe("ERRO DE TIPO | ESSENCIAL\n↑ | ACIDENTAL");
  });
});
