import { normalizeWithMap } from "@/lib/highlights/normalize";
import type { ParagraphRef, Point } from "@/lib/highlights/types";

// Texto "achatado" de um conjunto de parágrafos: textos unidos por "\n", com o início de cada um.
export type Flat = { text: string; paragraphs: ParagraphRef[]; starts: number[]; indexById: Map<string, number> };

// Uma publicação reancora milhares de grifos sobre o mesmo texto: achatar e normalizar uma única vez por lista de parágrafos.
const flats = new WeakMap<ParagraphRef[], Flat>();
const normalized = new WeakMap<Flat, { text: string; map: number[] }>();

export function flatten(paragraphs: ParagraphRef[]): Flat {
  const cached = flats.get(paragraphs);
  if (cached) return cached;
  const starts: number[] = [];
  let cursor = 0;
  for (const paragraph of paragraphs) { starts.push(cursor); cursor += paragraph.text.length + 1; }
  const flat = { text: paragraphs.map((paragraph) => paragraph.text).join("\n"), paragraphs, starts, indexById: new Map(paragraphs.map((paragraph, index) => [paragraph.id, index])) };
  flats.set(paragraphs, flat);
  return flat;
}

export function normalizedOf(flat: Flat): { text: string; map: number[] } {
  const cached = normalized.get(flat);
  if (cached) return cached;
  const result = normalizeWithMap(flat.text);
  normalized.set(flat, result);
  return result;
}

export function indexOfPoint(flat: Flat, point: Point): number {
  const index = flat.indexById.get(point.paragraphId);
  return index === undefined ? -1 : flat.starts[index] + point.offset;
}

// Converte um índice do texto achatado num ponto; o início nunca cai no "\n" e o fim nunca no começo do parágrafo seguinte.
export function pointAt(flat: Flat, index: number, edge: "start" | "end"): Point {
  let low = 0, high = flat.paragraphs.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (flat.starts[mid] <= index) low = mid; else high = mid - 1;
  }
  let i = low;
  const end = (k: number) => flat.starts[k] + flat.paragraphs[k].text.length;
  if (edge === "start" && index >= end(i) && i < flat.paragraphs.length - 1) i += 1;
  return { paragraphId: flat.paragraphs[i].id, offset: Math.min(Math.max(0, index - flat.starts[i]), flat.paragraphs[i].text.length) };
}
