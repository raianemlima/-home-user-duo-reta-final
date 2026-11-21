import { PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { formatParagraphs } from "@/lib/formatting/align";
import { extractStyledLines } from "@/lib/formatting/pdf-styles";
import type { StyledDocument } from "@/lib/formatting/types";

// PDF de teste: corpo na margem 54, negrito, itálico, verde, uma caixa colorida, um sublinhado, uma citação recuada
// e um cabeçalho (que fica de fora).
async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const [regular, bold, italic] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold), pdf.embedFont(StandardFonts.HelveticaOblique)]);
  const ink = rgb(0.13, 0.16, 0.15);
  const write = (text: string, x: number, y: number, font = regular, color = ink) => { page.drawText(text, { x, y, size: 11, font, color }); return x + font.widthOfTextAtSize(text, 11); };
  write("EBOOK DE RETA FINAL", 54, 760);
  let x = write("A nacionalidade diz respeito ao ", 54, 640);
  x = write("vinculo juridico-politico", x, 640, bold);
  write(" entre pessoa e Estado.", x, 640);
  x = write("Pelo criterio ", 54, 620);
  x = write("jus soli", x, 620, italic);
  write(" vale o local do nascimento.", x, 620);
  write("Titulo em verde", 54, 600, bold, rgb(0.1, 0.48, 0.24));
  page.drawRectangle({ x: 50, y: 560, width: 500, height: 26, color: rgb(0.76, 0.99, 0.73) });
  write("DE OLHO NO EXAMINADOR: tema recorrente.", 60, 568, regular, rgb(0, 0, 0));
  x = write("Repare no ", 54, 540);
  const start = x;
  x = write("sistema tripartite", x, 540);
  page.drawRectangle({ x: start, y: 538, width: x - start, height: 0.8, color: ink });
  write(" da teoria do crime.", x, 540);
  write("E assegurado o direito a nacionalidade brasileira", 200, 510);
  write("originaria a pessoa nascida no exterior.", 200, 496);
  for (let i = 0; i < 6; i++) write(`Linha comum de corpo numero ${i + 1} para firmar a margem.`, 54, 470 - i * 16);
  return pdf.save();
}

describe("leitura da formatação do PDF", () => {
  it("negrito, itálico, cor, caixa, sublinhado, recuo e margem; cabeçalho fora", async () => {
    const doc = await extractStyledLines(await samplePdf());
    const line = (start: string) => doc.lines.find((item) => item.runs.map((run) => run.text).join("").startsWith(start));
    expect(doc.lines.some((item) => item.runs.some((run) => run.text.includes("EBOOK")))).toBe(false);
    expect(doc.bodyColor).toBe("#212926");
    expect(line("A nacionalidade")?.runs.map((run) => [run.text.trim(), run.bold])).toEqual([["A nacionalidade diz respeito ao", false], ["vinculo juridico-politico", true], ["entre pessoa e Estado.", false]]);
    expect(line("Pelo criterio")?.runs.find((run) => run.text.includes("jus soli"))?.italic).toBe(true);
    expect(line("Titulo em verde")?.runs[0]).toMatchObject({ bold: true, color: "#1a7a3d" });
    expect(line("DE OLHO")?.box).toBe("#c2fcba");
    expect(line("Repare no")?.runs.find((run) => run.text.includes("tripartite"))?.underline).toBe(true);
    expect(line("Repare no")?.runs.find((run) => run.text.includes("da teoria"))?.underline).toBe(false);
    expect(line("E assegurado")).toMatchObject({ x0: 200, marginX: 54 });
  });
});

describe("encaixe no texto publicado", () => {
  it("marca negrito, itálico, sublinhado e cor; recuo da citação; caixa; o texto nunca muda", async () => {
    const doc = await extractStyledLines(await samplePdf());
    const paragraphs = [
      { id: "p1", kind: "body", text: "A nacionalidade diz respeito ao vinculo juridico-politico entre pessoa e Estado." },
      { id: "p2", kind: "body", text: "Pelo criterio jus soli vale o local do nascimento." },
      { id: "p3", kind: "body", text: "DE OLHO NO EXAMINADOR: tema recorrente." },
      { id: "p4", kind: "body", text: "Repare no sistema tripartite da teoria do crime." },
      // Quebra de linha com hífen e espaços diferentes do PDF.
      { id: "p5", kind: "body", text: "E assegurado o direito a nacionalidade brasileira origi-\nnaria a pessoa nascida no exterior." },
      { id: "p6", kind: "body", text: "Este parágrafo não existe no PDF." },
      { id: "p7", kind: "table", text: "A | B" },
    ];
    const { formats, matched } = formatParagraphs(paragraphs, doc);
    expect(matched).toBe(5);
    expect(formats.get("p1")).toEqual({ m: [[32, 57, "b"]] });
    expect(paragraphs[0].text.slice(32, 57)).toBe("vinculo juridico-politico");
    expect(formats.get("p2")).toEqual({ m: [[14, 22, "i"]] });
    expect(formats.get("p3")).toEqual({ box: "#c2fcba" });
    expect(formats.get("p4")).toEqual({ m: [[10, 28, "u"]] });
    expect(formats.get("p5")?.indent).toBe(3);
    expect(formats.has("p6")).toBe(false);
    expect(formats.has("p7")).toBe(false);
    for (const [id, format] of formats) for (const [from, to] of format.m ?? []) { const text = paragraphs.find((item) => item.id === id)!.text; expect(0 <= from && from < to && to <= text.length).toBe(true); }
  });

  it("marcador só quando não está no texto; DICA DUO sem cor nem caixa do PDF; parágrafo seguinte da dica sem caixa", () => {
    const line = (y: number, text: string, extra: Partial<StyledDocument["lines"][number]> = {}, runs?: StyledDocument["lines"][number]["runs"]) => ({ page: 1, y, x0: 54, textX0: 54, fontSize: 11, marginX: 54, box: null, runs: runs ?? [{ text, bold: false, italic: false, underline: false, color: null, symbol: false }], ...extra });
    const run = (text: string, extra: Partial<StyledDocument["lines"][number]["runs"][number]> = {}) => ({ text, bold: false, italic: false, underline: false, color: null, symbol: false, ...extra });
    const doc: StyledDocument = { bodyColor: "#222a25", lines: [
      line(700, "", { x0: 72, textX0: 90 }, [run("✔", { symbol: true }), run(" Ordinaria: residentes ha 4 anos.")]),
      line(680, "", { x0: 72, textX0: 90 }, [run("✔", { symbol: true }), run(" Extraordinaria: 15 anos.")]),
      line(660, "", { box: "#e9f3ec" }, [run("DICA DUO", { bold: true, color: "#ffffff" }), run(" Como usar", { bold: true })]),
      line(640, "Texto da dica.", { box: "#e9f3ec" }),
    ] };
    const { formats } = formatParagraphs([
      { id: "a", kind: "body", text: "Ordinaria: residentes ha 4 anos." },
      { id: "b", kind: "body", text: "✔ Extraordinaria: 15 anos." },
      { id: "t", kind: "tip", text: "DICA DUO Como usar" },
      { id: "u", kind: "body", text: "Texto da dica." },
    ], doc);
    expect(formats.get("a")).toEqual({ bullet: "check", indent: 1 });
    expect(formats.get("b")).toEqual({ indent: 1 });
    expect(formats.get("t")).toEqual({ m: [[0, 18, "b"]] });
    expect(formats.has("u")).toBe(false);
  });
});
