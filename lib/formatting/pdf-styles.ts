import { FOOTER_ZONE, HEADER_ZONE } from "@/lib/extraction/layout";
import { loadPdfjs } from "@/lib/extraction/pdfjs-loader";
import type { Run, StyledDocument, StyledLine } from "@/lib/formatting/types";

type Matrix = [number, number, number, number, number, number];
type Box = { x0: number; y0: number; x1: number; y1: number; color: string };
type Item = { text: string; x: number; y: number; width: number; fontSize: number; font: string; color: string | null };

const BOLD = /bold|black|heavy|semibold|demi/i;
const ITALIC = /italic|oblique/i;
const SYMBOL_FONT = /emoji|wingding|symbol|dingbat|zapf/i;
const SYMBOL_TEXT = /^[✔✓✗✘•●▪■◆♦➢➤►▶○◦❖➔→]$/u;

const multiply = (a: Matrix, b: Matrix): Matrix => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function hexOf(args: unknown[]): string | null {
  const value = args[0];
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (args.length >= 3 && args.slice(0, 3).every((part) => typeof part === "number")) return `#${(args.slice(0, 3) as number[]).map((part) => Math.round(part <= 1 ? part * 255 : part).toString(16).padStart(2, "0")).join("")}`;
  return null;
}
const isWhite = (hex: string) => parseInt(hex.slice(1, 3), 16) > 245 && parseInt(hex.slice(3, 5), 16) > 245 && parseInt(hex.slice(5, 7), 16) > 245;

// Percorre as operações de desenho da página: a cor de preenchimento de cada glifo de texto (em ordem) e os retângulos
// preenchidos (caixas coloridas e traços finos de sublinhado), já no espaço da página.
function scanOperators(fnArray: number[], argsArray: unknown[][], OPS: Record<string, number>) {
  const glyphColors: (string | null)[] = [];
  const boxes: Box[] = [];
  const fills = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const strokes = new Set([OPS.stroke, OPS.closeStroke]);
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let fill: string | null = null, stroke: string | null = null;
  const stack: { ctm: Matrix; fill: string | null; stroke: string | null }[] = [];
  fnArray.forEach((fn, index) => {
    const args = (argsArray[index] ?? []) as unknown[];
    if (fn === OPS.save) stack.push({ ctm, fill, stroke });
    else if (fn === OPS.restore) { const top = stack.pop(); if (top) ({ ctm, fill, stroke } = top); }
    else if (fn === OPS.transform) ctm = multiply(Array.from(args as number[]) as Matrix, ctm);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push({ ctm, fill, stroke }); const matrix = args[0] as ArrayLike<number> | null; if (matrix && matrix.length === 6) ctm = multiply(Array.from(matrix) as Matrix, ctm); }
    else if (fn === OPS.paintFormXObjectEnd) { const top = stack.pop(); if (top) ({ ctm, fill, stroke } = top); }
    else if (fn === OPS.setFillRGBColor || fn === OPS.setFillGray || fn === OPS.setFillCMYKColor) fill = hexOf(args);
    else if (fn === OPS.setStrokeRGBColor || fn === OPS.setStrokeGray || fn === OPS.setStrokeCMYKColor) stroke = hexOf(args);
    else if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
      const glyphs = (args[fn === OPS.nextLineSetSpacingShowText ? 2 : 0] ?? []) as unknown[];
      for (const glyph of glyphs) {
        const unicode = (glyph as { unicode?: string } | null)?.unicode;
        if (typeof unicode === "string") for (const char of unicode) if (char.trim()) glyphColors.push(fill);
      }
    } else if (fn === OPS.constructPath) {
      const paint = args[0] as number;
      const color = fills.has(paint) ? fill : strokes.has(paint) ? stroke : null;
      if (!color) return;
      const raw = (args[1] as ArrayLike<ArrayLike<number> | null> | undefined)?.[0];
      if (!raw) return;
      const data = Array.from(raw as ArrayLike<number>);
      let points: [number, number][] = []; let curved = false;
      const flush = () => {
        if (points.length >= 2 && !curved) {
          const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]);
          boxes.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), color });
        }
        points = []; curved = false;
      };
      for (let i = 0; i < data.length;) {
        const op = data[i];
        if (op === 0) { flush(); points.push(apply(ctm, data[i + 1], data[i + 2])); i += 3; }
        else if (op === 1) { points.push(apply(ctm, data[i + 1], data[i + 2])); i += 3; }
        else if (op === 2) { curved = true; i += 7; }
        else if (op === 3) { curved = true; i += 5; }
        else if (op === 4) i += 1;
        else break;
      }
      flush();
    }
  });
  return { glyphColors, boxes };
}

const mode = (values: number[]) => {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
};

// Lê o PDF e devolve as linhas do corpo das páginas com o estilo de cada trecho (negrito, itálico, sublinhado, cor),
// a caixa colorida em que a linha está e a margem esquerda da página.
export async function extractStyledLines(bytes: Uint8Array): Promise<StyledDocument> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0, fontExtraProperties: true });
  const lines: StyledLine[] = [];
  const colorChars = new Map<string, number>();
  try {
    const pdf = await task.promise;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const { width, height } = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      const content = await page.getTextContent();
      const { glyphColors, boxes } = scanOperators(ops.fnArray, ops.argsArray as unknown[][], pdfjs.OPS as unknown as Record<string, number>);
      const fontNames = new Map<string, string>();
      const fontOf = (id: string) => {
        if (!fontNames.has(id)) { let name = ""; try { name = (page.commonObjs.get(id) as { name?: string } | null)?.name ?? ""; } catch { name = ""; } fontNames.set(id, name); }
        return fontNames.get(id) as string;
      };
      let glyph = 0;
      const items: Item[] = [];
      for (const raw of content.items) {
        if (!("str" in raw)) continue;
        const chars = [...raw.str].filter((char) => char.trim()).length;
        // Cor do item: a dos glifos correspondentes (as letras do texto e os glifos desenhados vêm na mesma ordem).
        const slice = glyphColors.slice(glyph, glyph + chars);
        glyph += chars;
        if (!raw.str.trim()) continue;
        const counts = new Map<string | null, number>();
        for (const color of slice) counts.set(color, (counts.get(color) ?? 0) + 1);
        const color = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        items.push({ text: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width, fontSize: Math.hypot(raw.transform[2], raw.transform[3]) || raw.height, font: fontOf(raw.fontName), color });
      }
      const fills = boxes.filter((box) => box.y1 - box.y0 > 4 && box.x1 - box.x0 > 20 && !isWhite(box.color) && (box.x1 - box.x0) * (box.y1 - box.y0) < width * height * 0.8);
      const rules = boxes.filter((box) => box.y1 - box.y0 <= 1.5 && box.x1 - box.x0 > 2);
      // Linhas: itens na mesma altura (mesma regra do layout).
      const sorted = items.sort((a, b) => b.y - a.y || a.x - b.x);
      const groups: Item[][] = [];
      for (const item of sorted) {
        const group = groups[groups.length - 1];
        if (group && Math.abs(group[0].y - item.y) <= Math.max(1, item.fontSize * 0.5)) group.push(item);
        else groups.push([item]);
      }
      const pageLines: StyledLine[] = [];
      for (const group of groups) {
        const y = group[0].y;
        if (y > height * (1 - HEADER_ZONE) || y < height * FOOTER_ZONE) continue;
        const ordered = [...group].sort((a, b) => a.x - b.x);
        const fontSize = Math.max(...ordered.map((item) => item.fontSize));
        const runs: Run[] = [];
        let last: Item | null = null;
        for (const item of ordered) {
          const gap = last ? item.x - (last.x + last.width) : 0;
          const text = (last && gap > fontSize * 0.15 && !/\s$/.test(last.text) && !/^\s/.test(item.text) ? " " : "") + item.text;
          const symbol = SYMBOL_FONT.test(item.font) || SYMBOL_TEXT.test(item.text.trim());
          const style = { bold: BOLD.test(item.font), italic: ITALIC.test(item.font), color: item.color, symbol };
          // Sublinhado: traço fino logo abaixo da linha de base. Decidido letra a letra (posição estimada pela largura),
          // porque o PDF pode juntar num item só um trecho sublinhado e outro não.
          const under = rules.filter((rule) => rule.y1 <= item.y + 1 && rule.y0 >= item.y - item.fontSize * 0.4 && rule.x1 > item.x && rule.x0 < item.x + item.width);
          const chars = [...text];
          const step = item.width / Math.max(1, [...item.text].length);
          const offset = chars.length - [...item.text].length;
          const marked = chars.map((_, index) => { const center = item.x + (index - offset + 0.5) * step; return index >= offset && under.some((rule) => rule.x0 <= center && center <= rule.x1); });
          // A posição de cada letra é estimada: a palavra inteira segue a maioria das letras dela.
          for (const word of text.matchAll(/\S+/gu)) {
            const from = [...text.slice(0, word.index)].length, size = [...word[0]].length;
            const hits = marked.slice(from, from + size).filter(Boolean).length;
            marked.fill(hits * 2 >= size, from, from + size);
          }
          let current: Run | null = null;
          chars.forEach((char, index) => {
            const underline = marked[index];
            if (current && (current.underline === underline || !char.trim())) current.text += char;
            else { current = { text: char, ...style, underline }; runs.push(current); }
          });
          if (!symbol && item.color) for (const char of item.text) if (char.trim()) colorChars.set(item.color, (colorChars.get(item.color) ?? 0) + 1);
          last = item;
        }
        const first = ordered[0];
        const textStart = ordered.find((item) => !(SYMBOL_FONT.test(item.font) || SYMBOL_TEXT.test(item.text.trim()))) ?? first;
        const cx = (first.x + ordered[ordered.length - 1].x + ordered[ordered.length - 1].width) / 2, cy = y + fontSize * 0.3;
        const box = fills.filter((candidate) => candidate.x0 <= cx && cx <= candidate.x1 && candidate.y0 <= cy && cy <= candidate.y1).sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))[0]?.color ?? null;
        pageLines.push({ page: number, y, x0: first.x, textX0: textStart.x, fontSize, runs, box, marginX: 0 });
      }
      lines.push(...pageLines);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  // Margem esquerda: a posição de início de linha mais comum no documento (o corpo do texto). Uma página só com
  // citações recuadas não muda a margem.
  const margin = mode(lines.map((line) => Math.round(line.x0)));
  for (const line of lines) line.marginX = margin;
  const bodyColor = [...colorChars].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { lines, bodyColor };
}
