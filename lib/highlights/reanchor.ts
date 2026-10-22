import { AnchorError, createAnchor } from "@/lib/highlights/anchor";
import { flatten, pointAt, type Flat } from "@/lib/highlights/flat";
import { normalize, normalizeWithMap } from "@/lib/highlights/normalize";
import type { Anchor, ParagraphRef, ReanchorResult, VersionText } from "@/lib/highlights/types";

const pathKey = (path: string[]) => path.join(" › ");

// 1º passo: os parágrafos do grifo existem na nova versão com o mesmo hash, em sequência e na mesma seção.
function byHash(anchor: Anchor, oldDoc: VersionText, newDoc: VersionText): Anchor | null {
  const from = oldDoc.paragraphs.findIndex((paragraph) => paragraph.id === anchor.start.paragraphId);
  const to = oldDoc.paragraphs.findIndex((paragraph) => paragraph.id === anchor.end.paragraphId);
  if (from < 0 || to < from) return null;
  const hashes = oldDoc.paragraphs.slice(from, to + 1).map((paragraph) => paragraph.hash);
  const matches: number[] = [];
  for (let i = 0; i + hashes.length <= newDoc.paragraphs.length; i += 1) {
    const span = newDoc.paragraphs.slice(i, i + hashes.length);
    if (span.every((paragraph, k) => paragraph.hash === hashes[k] && paragraph.sectionId === span[0].sectionId)) matches.push(i);
  }
  if (matches.length !== 1) return null;
  const span = newDoc.paragraphs.slice(matches[0], matches[0] + hashes.length);
  return withQuote(createAnchor(newDoc, { paragraphId: span[0].id, offset: anchor.start.offset }, { paragraphId: span[span.length - 1].id, offset: anchor.end.offset }), anchor);
}

const commonSuffix = (a: string, b: string) => { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1; return n; };
const commonPrefix = (a: string, b: string) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n += 1; return n; };

// 2º passo: busca do trecho normalizado; várias ocorrências são desempatadas pelo contexto antes e depois.
function byQuote(anchor: Anchor, flat: Flat, newDoc: VersionText): Anchor | null | "none" {
  const quote = normalize(anchor.quote);
  const { text, map } = normalizeWithMap(flat.text);
  const hits: number[] = [];
  for (let at = text.indexOf(quote); at >= 0 && quote; at = text.indexOf(quote, at + 1)) hits.push(at);
  if (!hits.length) return "none";
  let chosen = hits[0];
  if (hits.length > 1) {
    const prefix = normalize(anchor.prefix), suffix = normalize(anchor.suffix);
    const scored = hits.map((at) => ({ at, score: commonSuffix(text.slice(0, at), prefix) + commonPrefix(text.slice(at + quote.length), suffix) })).sort((a, b) => b.score - a.score);
    if (scored[0].score === scored[1].score) return null;
    chosen = scored[0].at;
  }
  const start = pointAt(flat, map[chosen], "start"), end = pointAt(flat, map[chosen + quote.length - 1] + 1, "end");
  try { return withQuote(createAnchor(newDoc, start, end), anchor); } catch (error) { if (error instanceof AnchorError) return null; throw error; }
}

const withQuote = (fresh: Anchor, saved: Anchor): Anchor => ({ ...fresh, quote: saved.quote });

function reanchorOne(anchor: Anchor, oldDoc: VersionText, newDoc: VersionText): Anchor | null {
  const viaHash = byHash(anchor, oldDoc, newDoc);
  if (viaHash) return viaHash;
  const oldStart: ParagraphRef | undefined = oldDoc.paragraphs.find((paragraph) => paragraph.id === anchor.start.paragraphId);
  if (oldStart) {
    const section = newDoc.paragraphs.filter((paragraph) => pathKey(paragraph.sectionPath) === pathKey(oldStart.sectionPath));
    if (section.length) {
      const inSection = byQuote(anchor, flatten(section), newDoc);
      if (inSection !== "none") return inSection;
    }
  }
  const whole = byQuote(anchor, flatten(newDoc.paragraphs), newDoc);
  return whole === "none" ? null : whole;
}

// Determinística e sem I/O: roda em lote na publicação de uma nova versão. Nada é apagado; sem âncora segura, o grifo fica órfão.
export function reanchor(highlights: { id: string; anchor: Anchor }[], oldDoc: VersionText, newDoc: VersionText): ReanchorResult[] {
  return highlights.map(({ id, anchor }) => {
    const next = reanchorOne(anchor, oldDoc, newDoc);
    return next ? { highlightId: id, status: "active", anchor: next } : { highlightId: id, status: "orphaned" };
  });
}
