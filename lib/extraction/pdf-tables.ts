import { collapseSpaces, joinLines } from "@/lib/extraction/text-utils";
import { CELL_BREAK, TABLE_EMPTY, TABLE_ROWSPAN, TABLE_SPAN } from "@/lib/extraction/plain";
import type { RawItem } from "@/lib/extraction/types";

// Tabelas do PDF reconstruídas pelas bordas que o PDF desenha (o Word exporta cada borda como um retângulo fino).
// Sem as bordas, o texto das células chega misturado linha a linha ("CICLO MULTI- Não há um pluralismo… CULTURAL").
// Com elas, cada pedaço de texto vai para a célula que o contém e a tabela sai no mesmo formato da tabela do Word:
// uma linha da tabela por linha do texto, células separadas por " | ", quebras dentro da célula como U+2028.

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type PdfTable = { top: number; bottom: number; text: string; fontSize: number };

type HEdge = { y: number; x0: number; x1: number };
type VEdge = { x: number; y0: number; y1: number };

// Espessura máxima de uma borda (bordas grossas do Word chegam a 4,5 pt) e tolerância de alinhamento entre bordas.
const THIN = 5;
const SNAP = 3.5;

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export type OpsTable = { fill: number; eoFill: number; stroke: number; closeStroke: number; fillStroke: number; eoFillStroke: number; closeFillStroke: number; closeEOFillStroke: number; constructPath: number; save: number; restore: number; transform: number; paintFormXObjectBegin: number; paintFormXObjectEnd: number };

// Retângulos desenhados na página (preenchidos ou contornados), já no espaço da página. Curvas e recortes ficam de fora.
export function rectsFromOperators(fnArray: number[], argsArray: unknown[][], OPS: OpsTable): { rects: Rect[]; lines: Rect[] } {
  const painted = new Set([OPS.fill, OPS.eoFill, OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const strokes = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const rects: Rect[] = []; const lines: Rect[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  fnArray.forEach((fn, index) => {
    const args = argsArray[index] ?? [];
    if (fn === OPS.save) { stack.push(ctm); return; }
    if (fn === OPS.restore) { ctm = stack.pop() ?? ctm; return; }
    if (fn === OPS.transform) { ctm = multiply(Array.from(args as number[]) as Matrix, ctm); return; }
    if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); const matrix = args[0] as ArrayLike<number> | null; if (matrix && matrix.length === 6) ctm = multiply(Array.from(matrix) as Matrix, ctm); return; }
    if (fn === OPS.paintFormXObjectEnd) { ctm = stack.pop() ?? ctm; return; }
    if (fn !== OPS.constructPath) return;
    const paint = args[0] as number;
    if (!painted.has(paint)) return;
    const raw = (args[1] as ArrayLike<ArrayLike<number> | null> | undefined)?.[0];
    if (!raw) return;
    const data = Array.from(raw as ArrayLike<number>);
    // DrawOPS do pdfjs: 0 moveTo(x,y), 1 lineTo(x,y), 2 curveTo(6), 3 quadraticCurveTo(4), 4 closePath.
    let points: [number, number][] = []; let curved = false;
    const flush = () => {
      if (points.length >= 2 && !curved) {
        const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1]);
        const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
        // Segmento solto contornado (linha de tabela desenhada como traço).
        if (points.length === 2 && strokes.has(paint)) lines.push(box);
        else if (points.length >= 4) { rects.push(box); if (strokes.has(paint)) lines.push({ x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y0 }, { x0: box.x0, y0: box.y1, x1: box.x1, y1: box.y1 }, { x0: box.x0, y0: box.y0, x1: box.x0, y1: box.y1 }, { x0: box.x1, y0: box.y0, x1: box.x1, y1: box.y1 }); }
      }
      points = []; curved = false;
    };
    for (let i = 0; i < data.length;) {
      const op = data[i];
      if (op === 0) { flush(); points.push(apply(ctm, data[i + 1], data[i + 2])); i += 3; }
      else if (op === 1) { points.push(apply(ctm, data[i + 1], data[i + 2])); i += 3; }
      else if (op === 2) { curved = true; i += 7; }
      else if (op === 3) { curved = true; i += 5; }
      else if (op === 4) { i += 1; }
      else break;
    }
    flush();
  });
  return { rects, lines };
}

function edgesOf(rects: Rect[], lines: Rect[]): { hs: HEdge[]; vs: VEdge[] } {
  const hs: HEdge[] = []; const vs: VEdge[] = [];
  for (const rect of [...rects, ...lines]) {
    const width = rect.x1 - rect.x0; const height = rect.y1 - rect.y0;
    if (height <= THIN && width > THIN) hs.push({ y: (rect.y0 + rect.y1) / 2, x0: rect.x0, x1: rect.x1 });
    else if (width <= THIN && height > THIN) vs.push({ x: (rect.x0 + rect.x1) / 2, y0: rect.y0, y1: rect.y1 });
  }
  // Bordas na mesma altura e encostadas viram uma só (o Word desenha cada trecho de borda por célula).
  const mergeH = (edges: HEdge[]) => {
    const out: HEdge[] = [];
    for (const edge of [...edges].sort((a, b) => a.y - b.y || a.x0 - b.x0)) {
      const same = out.find((other) => Math.abs(other.y - edge.y) <= SNAP && edge.x0 <= other.x1 + SNAP && edge.x1 >= other.x0 - SNAP);
      if (same) { same.x0 = Math.min(same.x0, edge.x0); same.x1 = Math.max(same.x1, edge.x1); } else out.push({ ...edge });
    }
    return out;
  };
  const mergeV = (edges: VEdge[]) => {
    const out: VEdge[] = [];
    for (const edge of [...edges].sort((a, b) => a.x - b.x || a.y0 - b.y0)) {
      const same = out.find((other) => Math.abs(other.x - edge.x) <= SNAP && edge.y0 <= other.y1 + SNAP && edge.y1 >= other.y0 - SNAP);
      if (same) { same.y0 = Math.min(same.y0, edge.y0); same.y1 = Math.max(same.y1, edge.y1); } else out.push({ ...edge });
    }
    return out;
  };
  return { hs: mergeH(hs), vs: mergeV(vs) };
}

// Valores próximos (a mesma borda desenhada em trechos) viram um só.
function clusters(values: number[]): number[] {
  const out: number[][] = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && value - last[last.length - 1] <= SNAP) last.push(value); else out.push([value]);
  }
  return out.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length);
}

type Grid = { xs: number[]; ys: number[]; vs: VEdge[]; hs: HEdge[] };

function gridsOf(hs: HEdge[], vs: VEdge[]): Grid[] {
  const parent = [...hs, ...vs].map((_, index) => index);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  hs.forEach((h, i) => vs.forEach((v, j) => {
    if (v.x >= h.x0 - SNAP && v.x <= h.x1 + SNAP && h.y >= v.y0 - SNAP && h.y <= v.y1 + SNAP) parent[find(i)] = find(hs.length + j);
  }));
  const groups = new Map<number, { hs: HEdge[]; vs: VEdge[] }>();
  [...hs, ...vs].forEach((edge, index) => {
    const root = find(index); const group = groups.get(root) ?? { hs: [], vs: [] };
    if (index < hs.length) group.hs.push(edge as HEdge); else group.vs.push(edge as VEdge);
    groups.set(root, group);
  });
  const grids: Grid[] = [];
  for (const group of groups.values()) {
    const xs = clusters(group.vs.map((edge) => edge.x));
    const ys = clusters(group.hs.map((edge) => edge.y)).reverse();
    if (xs.length < 3 || ys.length < 2) continue; // menos de duas colunas: quadro de destaque, não tabela
    grids.push({ xs, ys, vs: group.vs, hs: group.hs });
  }
  return grids;
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const superscript = (digits: string) => digits.split("").map((digit) => SUPERSCRIPT[Number(digit)]).join("");

type CellLine = { y: number; x0: number; x1: number; fontSize: number; text: string };

function linesOf(items: RawItem[]): CellLine[] {
  const lines: RawItem[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].y - item.y) <= Math.max(1, item.fontSize * 0.5)) line.push(item); else lines.push([item]);
  }
  return lines.map((group) => {
    const sorted = [...group].sort((a, b) => a.x - b.x);
    const fontSize = Math.max(...sorted.map((item) => item.fontSize));
    let text = ""; let right = -Infinity; let trailingSpace = false;
    const baseline = Math.min(...sorted.filter((item) => item.fontSize === fontSize).map((item) => item.y));
    for (const item of sorted) {
      let piece = item.text.trim(); if (!piece) continue;
      // Número de nota em corpo menor e acima da linha ("CF/88⁴⁶"): sobrescrito, como no Word.
      if (/^\d{1,3}$/.test(piece) && item.fontSize < fontSize * 0.8 && item.y > baseline + 1) piece = superscript(piece);
      const spaced = trailingSpace || /^\s/.test(item.text) || item.x - right > fontSize * 0.15;
      text += text && spaced ? ` ${piece}` : piece;
      right = Math.max(right, item.x + item.width); trailingSpace = /\s$/.test(item.text);
    }
    return { y: sorted[0].y, x0: sorted[0].x, x1: right, fontSize, text: collapseSpaces(text) };
  }).filter((line) => line.text);
}

// Item que abre um parágrafo dentro da célula: marcador de lista, alínea, "Ex.:", artigo, parágrafo.
const ITEM_START = /^(?:[•●▪■◦○➢➤►▶✓✔→\u2022\uF0B7\uF0A7\uF0D8\uF0FC-]\s*|\d{1,2}[.)]\s|[a-z]\)\s|(?:[ivxlc]{1,6}|[a-z])\.\s|Ex(?:emplo)?s?\.?\s*:|Obs\.?\s*:)/u;
// Artigo, parágrafo e inciso também abrem item, mas numa coluna estreita "§1º" cai no começo da linha no meio da frase:
// só contam depois de uma frase terminada.
const LEGAL_START = /^(?:Art(?:igos?)?\.?\s*\d|§\s*\d|Par[áa]grafo\s+[úu]nico|[IVXLC]{1,6}\s*[-–—)]\s)/u;

// Texto de uma célula: linhas visuais juntadas em parágrafos; parágrafos separados por quebra de linha (U+2028).
function cellText(items: RawItem[], left: number, right: number): string {
  const lines = linesOf(items);
  if (!lines.length) return "";
  const gaps = lines.slice(1).map((line, i) => lines[i].y - line.y).filter((gap) => gap > 0);
  const spacing = gaps.length ? Math.min(...gaps) : lines[0].fontSize * 1.2;
  const fullRight = Math.max(...lines.map((line) => line.x1));
  const paragraphs: string[][] = [[lines[0].text]];
  lines.slice(1).forEach((line, i) => {
    const previous = lines[i];
    const shortEnd = /[.:;!?]$/.test(previous.text) && previous.x1 < fullRight - Math.max(25, (right - left) * 0.15);
    const gap = previous.y - line.y;
    if (gap > spacing * 1.35 || gap > line.fontSize * 1.9 || ITEM_START.test(line.text) || (LEGAL_START.test(line.text) && /[.:;]$/.test(previous.text)) || shortEnd) paragraphs.push([line.text]);
    else paragraphs[paragraphs.length - 1].push(line.text);
  });
  return paragraphs.map(joinCellLines).filter(Boolean).join(CELL_BREAK);
}

// Palavra partida no fim da linha da célula. Duas formas, e o PDF não distingue a partição do texto de verdade:
// - com hífen ("MULTI-" + "CULTURAL"): hifenização do Word ou hífen real ("ESCRITAS- CONSUETUDINÁRIAS");
// - sem hífen, em coluna estreita ("constitucionalida" + "de"): quebra da palavra ou só a quebra de linha.
// A junção fica marcada e é resolvida com o vocabulário do documento inteiro (resolveBreaks): só vira uma palavra se
// ela existe no material.
export const HYPHEN_BREAK = "\u00AD";
export const WRAP_BREAK = "\u2061";
function joinCellLines(lines: string[]): string {
  let out = "";
  for (const line of lines) {
    if (out && /\p{L}-$/u.test(out) && /^\p{L}/u.test(line)) out += HYPHEN_BREAK + line;
    else if (out && /\p{L}$/u.test(out) && /^\p{L}/u.test(line)) out += WRAP_BREAK + line;
    else out = joinLines([out, line]);
  }
  return out;
}

const wordsOf = (text: string) => text.normalize("NFC").toLowerCase().split(/[^\p{L}]+/u).filter((word) => word.length >= 2);
// Vocabulário do material, sem as palavras das próprias junções em dúvida (senão "constitucionalida" se confirmaria).
export function vocabulary(texts: string[]): Set<string> {
  const words = new Set<string>();
  for (const text of texts) for (const word of wordsOf(text.replace(/\p{L}+(?=-?[\u00AD\u2061])|(?<=[\u00AD\u2061])\p{L}+/gu, " "))) words.add(word);
  return words;
}
const knownWord = (word: string, words: Set<string>) => words.has(word) || (word.length >= 6 && [...words].some((other) => other.length > word.length && other.startsWith(word)));

export function resolveBreaks(text: string, words: Set<string>): string {
  // A palavra seguinte é só olhada (lookahead): "não de\u2061constitucionalida\u2061de" tem duas junções seguidas.
  return text.replace(/(\p{L}+)-\u00AD(?=(\p{L}+))/gu, (_, head: string, tail: string) => {
    // Continuação em minúscula é sempre hifenização ("insuficiên-" + "cia"), como no resto do texto.
    if (/^\p{Ll}/u.test(tail) && /\p{Ll}$/u.test(head)) return head;
    return knownWord(`${head}${tail}`.normalize("NFC").toLowerCase(), words) ? head : `${head}- `;
  }).replace(/(\p{L}+)\u2061(?=(\p{L}+))/gu, (_, head: string, tail: string) => {
    const joined = `${head}${tail}`.normalize("NFC").toLowerCase();
    return !words.has(head.normalize("NFC").toLowerCase()) && words.has(joined) ? head : `${head} `;
  }).replace(/[\u00AD\u2061]/g, " ");
}

// Acha as tabelas da página, devolve cada uma já como texto e os itens que sobraram fora delas.
export function detectTables(items: RawItem[], drawn: { rects: Rect[]; lines: Rect[] }, page: { width: number; height: number }): { tables: PdfTable[]; rest: RawItem[] } {
  // A moldura da página inteira não é borda de tabela.
  const { hs, vs } = edgesOf(drawn.rects.filter((rect) => rect.x1 - rect.x0 < page.width * 0.95 || rect.y1 - rect.y0 < page.height * 0.95), drawn.lines);
  const used = new Set<RawItem>();
  const tables: PdfTable[] = [];
  const center = (item: RawItem): [number, number] => [item.x + item.width / 2, item.y + item.fontSize * 0.3];
  for (const grid of gridsOf(hs, vs)) {
    const { xs, ys } = grid;
    const left = xs[0], right = xs[xs.length - 1], top = ys[0], bottom = ys[ys.length - 1];
    const inside = items.filter((item) => { if (used.has(item) || !item.text.trim()) return false; const [x, y] = center(item); return x > left && x < right && y < top && y > bottom; });
    if (!inside.length) continue;
    type Cell = { left: number; right: number; span: number; items: RawItem[]; owner: Cell | null };
    const bands: Cell[][] = [];
    let previousBottom: number | null = null;
    for (let r = 0; r < ys.length - 1; r += 1) {
      const bandTop = ys[r], bandBottom = ys[r + 1];
      if (bandTop - bandBottom < 4) continue;
      const bandItems = inside.filter((item) => { const y = center(item)[1]; return y <= bandTop && y > bandBottom; });
      // Divisa entre colunas vale nesta linha só se a borda vertical cobre a linha; sem ela, as células estão mescladas.
      // (O texto pode passar por cima da borda: numeração de lista recuada para a esquerda, "viii.", invade a célula vizinha.)
      const cuts = xs.slice(1, -1).filter((x) => grid.vs.some((edge) => Math.abs(edge.x - x) <= SNAP && Math.min(edge.y1, bandTop) - Math.max(edge.y0, bandBottom) >= (bandTop - bandBottom) * 0.5));
      const bounds = [left, ...cuts, right];
      const above = bands.at(-1);
      const cells: Cell[] = bounds.slice(0, -1).map((start, c) => {
        const end = bounds[c + 1];
        const cell: Cell = { left: start, right: end, span: xs.filter((x) => x > start + SNAP && x < end - SNAP).length + 1, items: bandItems.filter((item) => { const x = center(item)[0]; return x > start && x <= end; }), owner: null };
        // Sem borda horizontal sobre a célula, ela continua a de cima (mesclagem vertical): o texto vai para lá.
        const ruled = grid.hs.some((edge) => Math.abs(edge.y - bandTop) <= SNAP && Math.min(edge.x1, end) - Math.max(edge.x0, start) >= (end - start) * 0.5);
        const upper = above && previousBottom === bandTop ? above.find((other) => Math.abs(other.left - start) <= SNAP && Math.abs(other.right - end) <= SNAP) : undefined;
        if (!ruled && upper) { const owner = upper.owner ?? upper; cell.owner = owner; owner.items.push(...cell.items); cell.items = []; }
        return cell;
      });
      bands.push(cells); previousBottom = bandBottom;
    }
    const rows: string[] = []; let filled = 0; let total = 0;
    for (const cells of bands) {
      if (cells.every((cell) => cell.owner) || !cells.some((cell) => cell.items.length || cell.owner)) continue;
      rows.push(cells.map((cell) => {
        if (cell.owner) return TABLE_SPAN.repeat(cell.span - 1) + TABLE_ROWSPAN;
        const text = cellText(cell.items, cell.left, cell.right);
        total += 1; if (text) filled += 1;
        return TABLE_SPAN.repeat(cell.span - 1) + (text || TABLE_EMPTY);
      }).join(" | "));
    }
    // Gráfico ou esquema desenhado com linhas (setas, caixas soltas) forma uma grade quase vazia: não é tabela.
    if (!rows.length || filled < total * 0.45) continue;
    inside.forEach((item) => used.add(item));
    const sizes = inside.map((item) => item.fontSize).sort((a, b) => a - b);
    tables.push({ top, bottom, text: rows.join("\n"), fontSize: sizes[Math.floor(sizes.length / 2)] });
  }
  return { tables: tables.sort((a, b) => b.top - a.top), rest: items.filter((item) => !used.has(item)) };
}

// Tabela que continua na página seguinte: o PDF desenha uma tabela por página, mas no material é uma só.
const cellsOf = (row: string) => row.split(" | ");
const spanOf = (cell: string) => 1 + (/^\u2063*/.exec(cell)?.[0].length ?? 0);
const widthOf = (text: string) => Math.max(...text.split("\n").map((row) => cellsOf(row).reduce((sum, cell) => sum + spanOf(cell), 0)));
const isEmpty = (cell: string) => !cell.replace(/[\u2060\u2063\s]/g, "");

export function continueTable(previous: string, next: string): string | null {
  if (widthOf(previous) !== widthOf(next)) return null;
  const before = previous.split("\n"); const after = next.split("\n");
  // Começa com um título que ocupa a largura toda ("CLASSIFICAÇÃO QUANTO À ORIGEM"): é outra tabela.
  if (cellsOf(after[0]).length === 1 && before[0] !== after[0]) return null;
  // Linha de cabeçalho repetida no alto da página (opção "repetir linha de cabeçalho" do Word).
  if (after.length > 1 && after[0] === before[0]) after.shift();
  const last = cellsOf(before[before.length - 1]); const first = cellsOf(after[0]);
  // Linha partida entre as páginas: a continuação tem célula vazia (o texto daquela coluna acabou na página anterior)
  // ou começa no meio da frase (minúscula).
  const content = (cell: string) => cell.replace(/^[\u2062\u2063]*/, "");
  const split = first.some(isEmpty) || first.some((cell) => /^\p{Ll}/u.test(content(cell)));
  if (last.length === first.length && split && first.some((cell) => !isEmpty(cell)) && !first.some((cell) => content(cell) === "\u2062")) {
    const merged = last.map((cell, index) => {
      const tail = first[index];
      if (isEmpty(tail)) return cell;
      if (isEmpty(cell)) return cell.replace(/\u2060/g, "") + content(tail);
      return cell + (/[.:;!?]$/.test(cell) && !/^\p{Ll}/u.test(content(tail)) ? "\u2028" : " ") + content(tail);
    });
    before[before.length - 1] = merged.join(" | ");
    after.shift();
  }
  return [...before, ...after].join("\n");
}
