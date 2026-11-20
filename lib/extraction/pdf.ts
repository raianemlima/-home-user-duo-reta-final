import { buildLayout } from "@/lib/extraction/layout";
import { continueTable, detectTables, rectsFromOperators, resolveBreaks, vocabulary } from "@/lib/extraction/pdf-tables";
import { loadPdfjs } from "@/lib/extraction/pdfjs-loader";
import { ExtractionError, MAX_PDF_PAGES, MIN_TEXT_CHARS, type DocumentExtraction, type ExtractedPage, type ExtractOptions, type ExtractionWarning, type LayoutBlock, type RawItem } from "@/lib/extraction/types";

const FILE_ERRORS = new Set(["InvalidPDFException", "MissingPDFException", "FormatError"]);

// Só exceções que o pdfjs lança por causa do ARQUIVO viram erro de arquivo. Qualquer outra falha (ambiente, worker,
// memória) é relançada como está: não é culpa do arquivo e pode ser retentada pelo motor de etapas.
function classify(error: unknown): unknown {
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException") return new ExtractionError("password_protected", "O PDF está protegido por senha. Remova a proteção, salve uma cópia sem senha e reenvie.");
  if (FILE_ERRORS.has(name)) return new ExtractionError("corrupted", "O PDF está corrompido ou incompleto. Baixe o arquivo novamente (ou reexporte-o) e reenvie.");
  return error;
}

const charCountOf = (page: ExtractedPage) => page.blocks.filter((block) => block.kind !== "header" && block.kind !== "footer").reduce((total, block) => total + block.text.replace(/\s/g, "").length, 0);

export async function extractPdf(bytes: Uint8Array, options: ExtractOptions = {}): Promise<DocumentExtraction> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 });
  const pages: ExtractedPage[] = [];
  try {
    const pdf = await task.promise.catch((error: unknown) => { throw classify(error); });
    if (pdf.numPages > MAX_PDF_PAGES) throw new ExtractionError("too_large", `O PDF tem ${pdf.numPages} páginas (limite: ${MAX_PDF_PAGES}). Divida o arquivo em partes menores.`);
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: RawItem[] = content.items.flatMap((item) => ("str" in item && item.str.trim() ? [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, fontSize: Math.hypot(item.transform[2], item.transform[3]) || item.height }] : []));
      // Tabelas: reconstruídas pelas bordas desenhadas; o texto delas sai do fluxo comum e entra como tabela.
      const ops = await page.getOperatorList();
      const size = { width: viewport.width, height: viewport.height };
      const { tables, rest } = detectTables(items, rectsFromOperators(ops.fnArray, ops.argsArray, pdfjs.OPS), size);
      const blocks = buildLayout(rest, size, tables);
      const extracted: ExtractedPage = { page: number, width: viewport.width, height: viewport.height, blocks, charCount: 0, hasTextLayer: false, hasImages: false, blank: false, needsOcr: false, ocr: "not-needed" };
      extracted.charCount = charCountOf(extracted);
      extracted.hasTextLayer = extracted.charCount >= MIN_TEXT_CHARS;
      if (!extracted.hasTextLayer) {
        const imageOps = new Set<number>([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].filter((op) => typeof op === "number"));
        extracted.hasImages = ops.fnArray.some((fn: number) => imageOps.has(fn));
        extracted.blank = !extracted.hasImages && extracted.charCount === 0;
        extracted.needsOcr = !extracted.blank;
      }
      pages.push(extracted);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  // Tabela que termina uma página e recomeça no alto da seguinte vira uma tabela só (na página onde começa).
  const isFlow = (block: LayoutBlock) => block.kind === "body" || block.kind === "table";
  // Uma tabela pode atravessar várias páginas: a página do meio fica sem bloco próprio e a seguinte continua a mesma.
  let previous: LayoutBlock | undefined;
  for (const page of pages) {
    const next = page.blocks.find(isFlow);
    if (previous?.kind === "table" && next?.kind === "table") {
      const joined = continueTable(previous.text, next.text);
      if (joined !== null) { previous.text = joined; page.blocks = page.blocks.filter((block) => block !== next); }
    }
    // As notas de rodapé que vêm depois da tabela no fim da página não interrompem a tabela.
    const flow = page.blocks.filter(isFlow);
    let last = flow.length - 1;
    while (last > 0 && flow[last].kind === "body" && /^\d{1,3}\s/.test(flow[last].text) && flow.slice(0, last).some((block) => block.kind === "table" && flow[last].fontSize < block.fontSize)) last -= 1;
    previous = flow[last] ?? previous;
  }
  // Palavras partidas nas células das tabelas: decididas com o vocabulário do material inteiro.
  const words = vocabulary(pages.flatMap((page) => page.blocks.map((block) => block.text)));
  for (const block of pages.flatMap((page) => page.blocks)) if (block.kind === "table") block.text = resolveBreaks(block.text, words);
  return finalizeWithOcr(bytes, pages, options);
}

// OCR só nas páginas sem camada de texto. Sem provedor configurado, as páginas são sinalizadas (nunca "lidas" por simulação).
async function finalizeWithOcr(bytes: Uint8Array, pages: ExtractedPage[], options: ExtractOptions): Promise<DocumentExtraction> {
  const pending = pages.filter((page) => page.needsOcr).map((page) => page.page);
  const warnings: ExtractionWarning[] = [];
  if (pending.length && options.ocr) {
    try {
      const recognized = await options.ocr.recognize({ bytes, pages: pending });
      for (const page of pages.filter((candidate) => candidate.needsOcr)) {
        const text = recognized[page.page]?.trim();
        if (!text) continue;
        page.blocks = text.split(/\n{2,}/).map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean).map((part, index) => ({ kind: "body" as const, text: part, fontSize: 0, y: -index, column: null, heading: false, source: "ocr" as const }));
        page.charCount = charCountOf(page);
        page.ocr = "done";
        page.needsOcr = false;
      }
    } catch (error) {
      warnings.push({ code: "ocr_failed", pages: pending, message: `O OCR falhou: ${error instanceof Error ? error.message : "erro desconhecido"}. As páginas seguem sem texto.` });
    }
  }
  const stillPending = pages.filter((page) => page.needsOcr);
  stillPending.forEach((page) => { page.ocr = "unavailable"; });
  if (stillPending.length && !warnings.some((warning) => warning.code === "ocr_failed")) {
    warnings.push({ code: "ocr_unavailable", pages: stillPending.map((page) => page.page), message: "Estas páginas não têm camada de texto (digitalizadas) e o OCR não está habilitado. O conteúdo delas não foi lido." });
  }
  const withText = pages.filter((page) => page.charCount > 0).length;
  const status = withText === 0 ? "no-text" : stillPending.length ? "partial" : "text";
  return { format: "pdf", status, pageCount: pages.length, pages, warnings };
}
