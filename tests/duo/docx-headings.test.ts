import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { cleanDocument } from "@/lib/cleaning/clean";
import { extractOriginal } from "@/lib/extraction";

const paragraph = (text: string, pPr = "") => `<w:p><w:pPr>${pPr}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
async function docx(body: string) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

// Vade Esperto em Word: o nome de cada lei é título por "nível de tópico", e o sumário automático vem antes.
const VADE = [
  `<w:p><w:pPr><w:pStyle w:val="Sumrio1"/></w:pPr><w:r><w:instrText> TOC \\o "1-3" \\h </w:instrText></w:r><w:r><w:t>Lei de Crimes Hediondos</w:t></w:r><w:r><w:instrText> PAGEREF _Toc1 \\h </w:instrText></w:r><w:r><w:t>3</w:t></w:r></w:p>`,
  paragraph("Lei de Crimes Hediondos", `<w:outlineLvl w:val="0"/>`),
  paragraph("Art. 1º São considerados hediondos os seguintes crimes, todos tipificados no Código Penal:"),
  paragraph("Estatuto do Desarmamento", `<w:pStyle w:val="Heading1"/>`),
  paragraph("Art. 14. Portar, deter, adquirir, fornecer, receber, ter em depósito arma de fogo de uso permitido."),
].join("");

describe("Word com títulos de lei", () => {
  it("título por estilo ou por nível de tópico; o sumário automático e os códigos de campo saem", async () => {
    const extraction = await extractOriginal("docx", await docx(VADE));
    const blocks = extraction.pages[0].blocks;
    expect(blocks.map((block) => [block.text.slice(0, 24), block.heading])).toEqual([
      ["Lei de Crimes Hediondos", true], ["Art. 1º São considerados", false], ["Estatuto do Desarmamento", true], ["Art. 14. Portar, deter, ", false],
    ]);
    expect(blocks.some((block) => /PAGEREF|TOC \\o/.test(block.text))).toBe(false);
  });
  it("o nome da primeira lei, logo antes do Art. 1º, não é tratado como capa", async () => {
    const cleaned = cleanDocument(await extractOriginal("docx", await docx(VADE)), { mode: "faithful" });
    expect(cleaned.paragraphs[0]).toMatchObject({ text: "Lei de Crimes Hediondos", heading: true });
  });
});
