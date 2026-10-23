import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractOriginal } from "@/lib/extraction";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const run = (text: string, rPr = "") => `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
const p = (...runs: string[]) => `<w:p>${runs.join("")}</w:p>`;
const cell = (...paragraphs: string[]) => `<w:tc>${paragraphs.join("")}</w:tc>`;
async function docx(body: string, footnotes = "") {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`);
  if (footnotes) zip.file("word/footnotes.xml", `<?xml version="1.0"?><w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>${footnotes}</w:footnotes>`);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}
const texts = async (body: string, footnotes = "") => (await extractOriginal("docx", await docx(body, footnotes))).pages[0].blocks.map((block) => [block.kind, block.text]);

describe("leitura do Word fiel ao arquivo", () => {
  it("tabela de verdade: cabeçalho e linhas, células separadas e itens da célula um embaixo do outro", async () => {
    const table = `<w:tbl><w:tr>${cell(p(run("Elemento")))}${cell(p(run("Vício")))}</w:tr><w:tr>${cell(p(run("Competência")))}${cell(p(run("Em regra,")), p(run("sanável")))}</w:tr></w:tbl>`;
    expect(await texts(table)).toEqual([["table", "Elemento | Vício\nCompetência | Em regra, sanável"]]);
  });
  it("quadro de uma coluna (questão comentada): cada parágrafo numa linha, sem colar as frases", async () => {
    const box = `<w:tbl><w:tr>${cell(p(run("Julgue o item.")), p(run("[FCC – DPE SP – 2023 – CERTO]")), p(run("Lembrem que…")))}</w:tr></w:tbl>`;
    expect(await texts(box)).toEqual([["table", "Julgue o item.\n[FCC – DPE SP – 2023 – CERTO]\nLembrem que…"]]);
  });
  it("nota de rodapé: número no texto e a nota logo depois do parágrafo, sem grudar no número do artigo", async () => {
    const body = p(run("Colaboração premiada (art. 41"), `<w:r><w:footnoteReference w:id="2"/></w:r>`, run(")."));
    const notes = `<w:footnote w:id="2">${p(run("Art. 41. O indiciado que colaborar…"))}</w:footnote>`;
    expect(await texts(body, notes)).toEqual([["body", "Colaboração premiada (art. 41¹)."], ["footnote", "1 Art. 41. O indiciado que colaborar…"]]);
  });
  it("caixa de texto: o texto entra uma vez só, na ordem, e posição/alinhamento do desenho não viram texto", async () => {
    const drawing = `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><wp:positionH><wp:align>center</wp:align></wp:positionH><wp:positionV><wp:posOffset>306070</wp:posOffset></wp:positionV><wps:txbx><w:txbxContent>${p(run("Idade de ouro – a vítima era a protagonista"))}</w:txbxContent></wps:txbx></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:textbox><w:txbxContent>${p(run("Idade de ouro – a vítima era a protagonista"))}</w:txbxContent></v:textbox></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
    expect(await texts(p(run("Fases da vitimologia:"), drawing))).toEqual([["body", "Fases da vitimologia:"], ["body", "Idade de ouro – a vítima era a protagonista"]]);
  });
  it("sem estilos de título no arquivo: negrito em fonte grande vira título; com títulos no texto, não", async () => {
    const big = (text: string) => p(run(text, `<w:b/><w:sz w:val="28"/>`));
    const plain = await extractOriginal("docx", await docx(big("ÁREA CÍVEL") + p(run("35 teses institucionais"))));
    expect(plain.pages[0].blocks.map((block) => block.heading)).toEqual([true, false]);
    const numbered = await extractOriginal("docx", await docx(big("Ebook de Reta Final") + p(run("1 PARTE GERAL")) + p(run("1.1 Conduta")) + p(run("1.2 Dolo"))));
    expect(numbered.pages[0].blocks[0].heading).toBe(false);
  });
});
