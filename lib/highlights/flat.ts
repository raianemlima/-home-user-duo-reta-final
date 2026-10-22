import type { ParagraphRef, Point } from "@/lib/highlights/types";

// Texto "achatado" de um conjunto de parágrafos: textos unidos por "\n", com o início de cada um.
export type Flat = { text: string; paragraphs: ParagraphRef[]; starts: number[] };

export function flatten(paragraphs: ParagraphRef[]): Flat {
  const starts: number[] = [];
  let cursor = 0;
  for (const paragraph of paragraphs) { starts.push(cursor); cursor += paragraph.text.length + 1; }
  return { text: paragraphs.map((paragraph) => paragraph.text).join("\n"), paragraphs, starts };
}

export function indexOfPoint(flat: Flat, point: Point): number {
  const index = flat.paragraphs.findIndex((paragraph) => paragraph.id === point.paragraphId);
  return index < 0 ? -1 : flat.starts[index] + point.offset;
}

// Converte um índice do texto achatado num ponto; o início nunca cai no "\n" e o fim nunca no começo do parágrafo seguinte.
export function pointAt(flat: Flat, index: number, edge: "start" | "end"): Point {
  for (let i = 0; i < flat.paragraphs.length; i += 1) {
    const start = flat.starts[i], end = start + flat.paragraphs[i].text.length;
    if (edge === "start" ? index < end : index <= end) return { paragraphId: flat.paragraphs[i].id, offset: Math.max(0, index - start) };
  }
  const last = flat.paragraphs[flat.paragraphs.length - 1];
  return { paragraphId: last.id, offset: last.text.length };
}
