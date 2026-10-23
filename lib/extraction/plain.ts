import JSZip from "jszip";
import { collapseSpaces, joinLines } from "@/lib/extraction/text-utils";
import { ExtractionError, type DocumentExtraction, type LayoutBlock } from "@/lib/extraction/types";

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&amp;/g, "&");
}

function paragraphsToBlocks(paragraphs: string[], kind: "body" | "table" = "body"): LayoutBlock[] {
  return paragraphs.map((text, index) => ({ kind, text, fontSize: 0, y: -index, column: null, heading: /^#{1,6}\s/.test(text), source: "text-layer" as const })).filter((block) => block.text);
}

export function extractText(format: "md" | "txt", bytes: Uint8Array): DocumentExtraction {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ExtractionError("corrupted", "O arquivo não é um texto UTF-8 válido. Salve-o como UTF-8 e reenvie."); }
  const paragraphs = text.replace(/^﻿/, "").split(/\r?\n\s*\n/).map((part) => joinLines(part.split(/\r?\n/))).filter(Boolean);
  return plainResult(format, paragraphsToBlocks(paragraphs));
}

// Título no Word: estilo de título ("Heading 1", "Título 2") ou "nível de tópico" aplicado direto no parágrafo.
const DOCX_HEADING_STYLE = /<w:pStyle w:val="(?:Heading|T[ií]?tulo|Ttulo)\d"/i;
const DOCX_OUTLINE = /<w:outlineLvl w:val="[0-5]"\s*\/>/;
// Sumário automático do Word ("Sumário 1", "TOC 1"): é índice, não conteúdo.
const DOCX_TOC_STYLE = /<w:pStyle w:val="(?:Sum[áa]?rio\d|Sumrio\d|TOC\d|TOCHeading|Cabe[çc]?alhodoSum[áa]?rio|CabealhodoSumrio)"/i;

// Quebra de linha dentro de uma célula de tabela (itens um embaixo do outro): o leitor desenha como quebra.
export const CELL_BREAK = "\u2028";
// Célula vazia (U+2060) e célula que ocupa mais colunas (um U+2063 por coluna a mais, no começo): invisíveis na tela.
export const TABLE_EMPTY = "\u2060";
export const TABLE_SPAN = "\u2063";

// Número de nota de rodapé no texto, como no Word ("culposo¹"): o texto da nota vem logo depois do parágrafo.
const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const superscript = (value: number) => String(value).split("").map((digit) => SUPERSCRIPT[Number(digit)]).join("");

// Só o texto que o Word mostra: <w:t> (e tabulação/quebra como espaço). Atributos e posições de desenhos
// (<wp:posOffset>, <wp:align>) não são texto; códigos de campo (" TOC \o ", " PAGEREF ") também não.
function runText(fragment: string, footnote: (id: string) => string): string {
  let out = "";
  for (const match of fragment.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t\s*\/>|<w:(tab|br|cr)\b[^>]*\/>|<w:footnoteReference\b[^>]*w:id="(-?\d+)"[^>]*\/>|<w:noBreakHyphen\s*\/>/g)) {
    if (match[1] !== undefined) out += decodeXml(match[1]);
    else if (match[2]) out += " ";
    else if (match[3]) out += footnote(match[3]);
    else if (match[0].startsWith("<w:noBreakHyphen")) out += "-";
  }
  return collapseSpaces(out);
}

// Notas de rodapé (word/footnotes.xml), pelo id usado nas referências do texto.
function footnotesOf(xml: string | undefined): Map<string, string> {
  const notes = new Map<string, string>();
  for (const match of (xml ?? "").matchAll(/<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g)) {
    const id = /w:id="(-?\d+)"/.exec(match[1])?.[1];
    if (!id || /w:type="(?:separator|continuationSeparator|continuationNotice)"/.test(match[1])) continue;
    const text = (match[2].match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((paragraph) => runText(paragraph, () => "")).filter(Boolean).join(" ");
    if (text) notes.set(id, text);
  }
  return notes;
}

// Título "na mão": parágrafo curto, todo em negrito e com fonte de 13 pt ou mais (w:sz em meios-pontos).
function looksLikeHeading(paragraph: string, text: string): boolean {
  if (text.length > 120 || /[.;,:]$/.test(text)) return false;
  const runs = (paragraph.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? []).filter((run) => /<w:t[ >]/.test(run) && runText(run, () => "").trim());
  if (!runs.length) return false;
  const bold = runs.every((run) => /<w:b\/>|<w:b w:val="(?:1|true|on)"\/>/.test(run));
  const sizes = runs.map((run) => Number(/<w:sz w:val="(\d+)"/.exec(run)?.[1] ?? 0));
  return bold && Math.min(...sizes) >= 26;
}

export async function extractDocx(bytes: Uint8Array): Promise<DocumentExtraction> {
  let xml: string | undefined; let footnotesXml: string | undefined;
  try {
    const zip = await JSZip.loadAsync(bytes);
    xml = await zip.file("word/document.xml")?.async("text");
    footnotesXml = await zip.file("word/footnotes.xml")?.async("text");
  }
  catch { throw new ExtractionError("corrupted", "O DOCX está corrompido e não pôde ser aberto. Reexporte o arquivo e tente novamente."); }
  if (!xml) throw new ExtractionError("corrupted", "O DOCX não contém o documento principal. Abra e salve novamente no Word.");
  const notes = footnotesOf(footnotesXml);
  // Caixas de texto e esquemas desenhados: o Word grava duas vezes (versão nova e "Fallback" antigo); fica só a nova.
  // Cada desenho sai do parágrafo (as caixas têm parágrafos próprios, que quebrariam a leitura) e vira um marcador.
  const drawings: string[] = [];
  const body = xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "")
    .replace(/<w:drawing>[\s\S]*?<\/w:drawing>|<w:pict>[\s\S]*?<\/w:pict>/g, (drawing) => { drawings.push(drawing); return `<w:drawingRef w:n="${drawings.length - 1}"/>`; });
  // Documento sem nenhum estilo de título (títulos só em negrito e fonte maior): reconhece por essa formatação.
  // Também não vale para documento que já tem títulos no próprio texto ("1.1 …", "TÍTULO I", "Art. 5º").
  const textualHeadings = (body.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).filter((paragraph) => /^(?:\d+(?:\.\d+)*\.?\s+[A-ZÀ-Ú]|T[ÍI]TULO\s|CAP[ÍI]TULO\s|Art\.?\s*\d)/.test(runText(paragraph, () => ""))).length;
  const styledHeadings = DOCX_HEADING_STYLE.test(body) || DOCX_OUTLINE.test(body) || textualHeadings >= 3;
  const blocks: LayoutBlock[] = [];
  const push = (text: string, kind: LayoutBlock["kind"], heading = false) => { if (text) blocks.push({ kind, text, fontSize: 0, y: -blocks.length, column: null, heading, source: "text-layer" }); };
  let noteNumber = 0;
  const pending: string[] = [];
  const reference = (id: string) => { const text = notes.get(id); if (!text) return ""; noteNumber += 1; pending.push(`${noteNumber} ${text}`); return superscript(noteNumber); };
  const flushNotes = () => { for (const note of pending.splice(0)) push(note, "footnote"); };
  const boxesOf = (paragraph: string) => [...paragraph.matchAll(/<w:drawingRef w:n="(\d+)"\/>/g)].flatMap((match) => [...drawings[Number(match[1])].matchAll(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/g)])
    .flatMap((box) => (box[1].match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\s*\/>/g) ?? []).map((inner) => runText(inner, reference)).filter(Boolean));
  for (const part of body.split(/(<w:tbl>[\s\S]*?<\/w:tbl>)/)) {
    if (part.startsWith("<w:tbl>")) {
      // Quadro de uma coluna (questão comentada, caixa de destaque): cada parágrafo do Word numa linha, como no arquivo.
      // Tabela de verdade: uma linha da tabela por linha do texto, células separadas por " | ".
      const rows = (part.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map((row) => (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [])
        .map((cell) => ({ span: Number(/<w:gridSpan w:val="(\d+)"/.exec(cell)?.[1] ?? 1), lines: (cell.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).flatMap((paragraph) => [runText(paragraph, reference), ...boxesOf(paragraph)]).filter(Boolean) })));
      const singleColumn = rows.every((cells) => cells.length <= 1);
      // Célula vazia e célula mesclada levam marcas invisíveis (não aparecem nem mudam a leitura): sem elas, a limpeza
      // de espaços some com a célula vazia e a tabela "anda" uma coluna; com elas, o leitor remonta a tabela do Word.
      const cellText = (cell: { span: number; lines: string[] }) => TABLE_SPAN.repeat(Math.max(0, cell.span - 1)) + (cell.lines.join(CELL_BREAK) || TABLE_EMPTY);
      const lines = singleColumn ? rows.flatMap((cells) => cells[0]?.lines ?? []) : rows.map((cells) => cells.map(cellText).join(" | ")).filter((row) => row.replace(/[\s|\u2060\u2063]/g, ""));
      push(lines.join("\n"), "table");
      flushNotes();
      continue;
    }
    for (const paragraph of part.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
      if (DOCX_TOC_STYLE.test(paragraph)) continue;
      const text = runText(paragraph, reference);
      const heading = text.length <= 150 && (DOCX_HEADING_STYLE.test(paragraph) || DOCX_OUTLINE.test(paragraph) || (!styledHeadings && looksLikeHeading(paragraph, text)));
      push(text, "body", heading || /^#{1,6}\s/.test(text));
      for (const boxText of boxesOf(paragraph)) push(boxText, "body");
      flushNotes();
    }
  }
  return plainResult("docx", blocks);
}

function plainResult(format: "docx" | "md" | "txt", blocks: LayoutBlock[]): DocumentExtraction {
  const charCount = blocks.reduce((total, block) => total + block.text.replace(/\s/g, "").length, 0);
  const page = { page: 1, width: 0, height: 0, blocks, charCount, hasTextLayer: charCount > 0, hasImages: false, blank: charCount === 0, needsOcr: false, ocr: "not-needed" as const };
  return { format, status: charCount > 0 ? "text" : "no-text", pageCount: 1, pages: [page], warnings: [] };
}
