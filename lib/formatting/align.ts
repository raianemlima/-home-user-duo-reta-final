import type { Mark, ParagraphFormat, Run, StyledDocument } from "@/lib/formatting/types";

// Encaixa a formatação lida do PDF no texto publicado de cada parágrafo, sem mudar o texto.
// A comparação ignora espaços e hífens (quebra de linha, junção de palavras) e usa a forma NFKC das letras.
type Styled = { key: string; style: string; color: string | null; line: number; symbol: boolean };

const SKIP = /[\s\-\u2010-\u2015\u00ad\u2028\u2060-\u2063]/u;
const MIN_MATCH = 0.9;
const LOOKAHEAD = 60;

// Cada chave tem exatamente uma unidade de texto (letras fora do plano básico viram \ufffd): assim a posição na
// string do fluxo é a mesma posição no vetor do fluxo.
function keysOf(text: string): { key: string; offset: number }[] {
  const out: { key: string; offset: number }[] = [];
  let offset = 0;
  for (const char of text) {
    if (!SKIP.test(char)) for (const part of char.normalize("NFKC").toLowerCase()) if (!SKIP.test(part)) out.push({ key: part.length > 1 ? "\ufffd" : part, offset });
    offset += char.length;
  }
  return out;
}

const styleOf = (run: Run) => `${run.bold ? "b" : ""}${run.italic ? "i" : ""}${run.underline ? "u" : ""}`;

function streamOf(doc: StyledDocument): Styled[] {
  const stream: Styled[] = [];
  doc.lines.forEach((line, index) => {
    for (const run of line.runs) {
      const color = run.color && run.color !== doc.bodyColor && !isNearBlack(run.color) ? run.color : null;
      for (const { key } of keysOf(run.text)) stream.push({ key, style: run.symbol ? "" : styleOf(run), color: run.symbol ? null : color, line: index, symbol: run.symbol });
    }
  });
  return stream;
}

function isNearBlack(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return Math.max(r, g, b) < 60;
}

// Procura as letras do parágrafo no fluxo do PDF. Exato quando possível; senão, ancora pelo começo e segue letra a
// letra, pulando o que só existe de um dos lados (marca d'água removida, número de nota). Devolve, para cada letra do
// parágrafo, a posição no fluxo (ou -1).
function locate(keys: string[], stream: Styled[], text: string, from: number): { map: number[]; end: number } | null {
  if (!keys.length) return null;
  const needle = keys.join("");
  let start = text.indexOf(needle, from);
  if (start < 0) start = text.indexOf(needle);
  if (start >= 0) return { map: keys.map((_, i) => start + i), end: start + keys.length };
  const head = keys.slice(0, Math.min(40, keys.length)).join("");
  let at = text.indexOf(head, from);
  if (at < 0) at = text.indexOf(head);
  if (at < 0) return null;
  const map: number[] = [];
  let j = at;
  for (let i = 0; i < keys.length; i++) {
    if (j < stream.length && stream[j].key === keys[i]) { map.push(j); j++; continue; }
    // Ressincroniza: as próximas letras do parágrafo aparecem um pouco adiante no PDF?
    const probe = keys.slice(i, i + 6).join("");
    const ahead = probe.length >= 4 ? text.indexOf(probe, j) : -1;
    if (ahead >= 0 && ahead - j <= LOOKAHEAD) { j = ahead; map.push(j); j++; }
    else map.push(-1);
  }
  return { map, end: j };
}

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; };
const levelOf = (delta: number) => delta < 14 ? 0 : delta < 50 ? 1 : delta < 100 ? 2 : delta < 150 ? 3 : 4;

// Devolve o formato de cada parágrafo que tem algo a mostrar e quantos parágrafos foram encontrados no PDF.
export function formatParagraphs(paragraphs: { id: string; text: string; kind: string }[], doc: StyledDocument): { formats: Map<string, ParagraphFormat>; matched: number } {
  const stream = streamOf(doc);
  const text = stream.map((item) => item.key).join("");
  const result = new Map<string, ParagraphFormat>();
  let cursor = 0, matchedParagraphs = 0;
  let tipBox: string | null = null;
  for (const paragraph of paragraphs) {
    if (paragraph.kind === "table") continue;
    const keyed = keysOf(paragraph.text);
    const found = locate(keyed.map((item) => item.key), stream, text, cursor);
    if (!found) continue;
    const matched = found.map.filter((index) => index >= 0).length;
    if (matched / keyed.length < MIN_MATCH) continue;
    if (found.end > cursor) cursor = found.end;
    matchedParagraphs++;
    // Estilo de cada letra (pela posição no texto); espaços e hífens herdam o estilo quando os vizinhos concordam.
    const styles: ({ style: string; color: string | null } | null)[] = new Array(paragraph.text.length).fill(null);
    keyed.forEach((item, i) => { const at = found.map[i]; if (at >= 0) styles[item.offset] = { style: stream[at].style, color: stream[at].color }; });
    for (let i = 0; i < styles.length; i++) {
      if (styles[i] || !SKIP.test(paragraph.text[i])) continue;
      let before = i - 1; while (before >= 0 && !styles[before]) before--;
      let after = i + 1; while (after < styles.length && !styles[after]) after++;
      const prev = before >= 0 ? styles[before] : null, next = after < styles.length ? styles[after] : null;
      if (prev && next && prev.style === next.style && prev.color === next.color) styles[i] = prev;
    }
    const marks: Mark[] = [];
    for (let i = 0; i < styles.length;) {
      const current = styles[i];
      if (!current || (!current.style && !current.color)) { i++; continue; }
      let end = i + 1;
      while (end < styles.length && styles[end] && styles[end]!.style === current.style && styles[end]!.color === current.color) end++;
      marks.push(current.color ? [i, end, current.style, current.color] : [i, end, current.style]);
      i = end;
    }
    // Linhas do PDF cobertas pelo parágrafo: recuo, marcador e caixa.
    const lineIds = [...new Set(found.map.filter((index) => index >= 0).map((index) => stream[index].line))].sort((a, b) => a - b);
    const lines = lineIds.map((id) => doc.lines[id]);
    const format: ParagraphFormat = {};
    if (marks.length) format.m = marks;
    if (lines.length) {
      const first = lines[0];
      // O marcador desenhado logo antes do texto (✔, ●) fica na linha, mas fora do parágrafo.
      // Quando o símbolo já está no texto publicado ("✔ Jus soli"), não se desenha outro.
      const bulletRun = first.runs.find((run) => run.symbol);
      if (bulletRun && !/^\s*[^\p{L}\p{N}\s(“"]/u.test(paragraph.text)) format.bullet = /[✔✓]/u.test(bulletRun.text) ? "check" : "dot";
      const rest = lines.length > 1 ? lines.slice(1).map((line) => line.textX0) : [first.textX0];
      const indent = levelOf(Math.min(first.textX0, median(rest)) - first.marginX);
      if (indent) format.indent = indent;
      const boxes = lines.map((line) => line.box).filter(Boolean) as string[];
      // Caixa: a cor que cobre a maioria das linhas do parágrafo.
      const counts = new Map<string, number>();
      for (const box of boxes) counts.set(box, (counts.get(box) ?? 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] * 2 > lines.length) format.box = top[0];
    }
    // Caixa DICA DUO: o app já tem desenho próprio (título e texto); a cor e o fundo do PDF não entram nela.
    if (paragraph.kind === "tip") { tipBox = format.box ?? null; delete format.box; if (format.m) format.m = format.m.map(([from, to, style]) => [from, to, style] as Mark).filter((mark) => mark[2]); }
    else if (format.box && format.box === tipBox) delete format.box;
    else tipBox = null;
    if (format.m) format.m = mergeMarks(format.m, paragraph.text);
    if (format.m && !format.m.length) delete format.m;
    if (Object.keys(format).length) result.set(paragraph.id, format);
  }
  return { formats: result, matched: matchedParagraphs };
}

// Junta marcas vizinhas de mesmo estilo e cor separadas só por espaço ("DICA DUO" + " " + "Como usar").
function mergeMarks(marks: Mark[], text: string): Mark[] {
  const out: Mark[] = [];
  for (const mark of marks) {
    const last = out[out.length - 1];
    if (last && last[2] === mark[2] && last[3] === mark[3] && /^\s*$/.test(text.slice(last[1], mark[0]))) last[1] = mark[1];
    else out.push([...mark] as Mark);
  }
  return out;
}
