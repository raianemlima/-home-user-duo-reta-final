import { flatten, indexOfPoint } from "@/lib/highlights/flat";
import { CONTEXT_CHARS, type Anchor, type Point, type VersionText } from "@/lib/highlights/types";

export class AnchorError extends Error {}

// Âncora de um trecho dentro de UMA seção: posição + texto exato + contexto (calculado no documento inteiro).
export function createAnchor(doc: VersionText, start: Point, end: Point): Anchor {
  const first = doc.paragraphs.find((paragraph) => paragraph.id === start.paragraphId);
  const last = doc.paragraphs.find((paragraph) => paragraph.id === end.paragraphId);
  if (!first || !last) throw new AnchorError("Trecho fora do material.");
  if (first.sectionId !== last.sectionId) throw new AnchorError("O grifo precisa ficar dentro de uma única seção.");
  if (start.offset < 0 || start.offset > first.text.length || end.offset < 0 || end.offset > last.text.length) throw new AnchorError("Trecho fora do parágrafo.");
  const flat = flatten(doc.paragraphs);
  const from = indexOfPoint(flat, start), to = indexOfPoint(flat, end);
  if (to <= from) throw new AnchorError("Selecione um trecho com pelo menos um caractere.");
  return { start, end, quote: flat.text.slice(from, to), prefix: flat.text.slice(Math.max(0, from - CONTEXT_CHARS), from), suffix: flat.text.slice(to, to + CONTEXT_CHARS) };
}
