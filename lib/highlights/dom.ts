import type { HighlightColor, Point } from "@/lib/highlights/types";

// Offset de (node, offset) dentro do parágrafo: soma o comprimento dos nós de texto anteriores (marcações não mudam o texto).
function offsetIn(paragraph: HTMLElement, node: Node, offset: number): number {
  const target = node.nodeType === Node.TEXT_NODE ? node : node.childNodes[offset] ?? null;
  const walker = paragraph.ownerDocument.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current === target) return total + (node.nodeType === Node.TEXT_NODE ? offset : 0);
    if (target && target.nodeType !== Node.TEXT_NODE && target.contains(current)) return total;
    total += (current as Text).length;
  }
  return total;
}

const paragraphOf = (node: Node, root: HTMLElement): HTMLElement | null => {
  const element = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
  const paragraph = element?.closest<HTMLElement>("[data-paragraph-id]") ?? null;
  return paragraph && root.contains(paragraph) ? paragraph : null;
};

// Seleção do navegador → pontos do grifo. null se sair dos parágrafos da seção ou estiver vazia.
export function rangeToPoints(range: Range, root: HTMLElement): { start: Point; end: Point } | null {
  const first = paragraphOf(range.startContainer, root), last = paragraphOf(range.endContainer, root);
  if (!first || !last) return null;
  const start = { paragraphId: first.dataset.paragraphId as string, offset: offsetIn(first, range.startContainer, range.startOffset) };
  const end = { paragraphId: last.dataset.paragraphId as string, offset: offsetIn(last, range.endContainer, range.endOffset) };
  if (first === last && end.offset <= start.offset) return null;
  return { start, end };
}

export type Span = { id: string; color: HighlightColor; from: number; to: number | null };
export type PaintedHighlight = { id: string; color: HighlightColor; start: Point; end: Point };

// Distribui cada grifo pelos parágrafos que ele cobre (to null = até o fim do parágrafo).
export function paragraphSpans(order: string[], highlights: PaintedHighlight[]): Map<string, Span[]> {
  const spans = new Map<string, Span[]>();
  for (const highlight of highlights) {
    const from = order.indexOf(highlight.start.paragraphId), to = order.indexOf(highlight.end.paragraphId);
    if (from < 0 || to < from) continue;
    for (let i = from; i <= to; i += 1) {
      const span: Span = { id: highlight.id, color: highlight.color, from: i === from ? highlight.start.offset : 0, to: i === to ? highlight.end.offset : null };
      spans.set(order[i], [...(spans.get(order[i]) ?? []), span]);
    }
  }
  return spans;
}

export type Segment = { text: string; marks: { id: string; color: HighlightColor }[] };

// Corta o texto nos limites dos grifos; cada pedaço sabe quais grifos o cobrem (sobreposição permitida).
export function segmentText(text: string, spans: Span[]): Segment[] {
  const cuts = new Set([0, text.length]);
  for (const span of spans) { cuts.add(Math.min(Math.max(span.from, 0), text.length)); cuts.add(Math.min(span.to ?? text.length, text.length)); }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i], to = points[i + 1];
    if (to <= from) continue;
    segments.push({ text: text.slice(from, to), marks: spans.filter((span) => span.from <= from && (span.to ?? text.length) >= to).map(({ id, color }) => ({ id, color })) });
  }
  return segments;
}
