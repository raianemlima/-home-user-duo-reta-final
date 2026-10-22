import { cleanDocument } from "@/lib/cleaning/clean";
import { buildDraft, draftToVersionText, type DraftSection } from "@/lib/content/build";
import { extractOriginal } from "@/lib/extraction";
import { createAnchor } from "@/lib/highlights/anchor";
import { reanchor } from "@/lib/highlights/reanchor";
import type { Anchor, VersionText } from "@/lib/highlights/types";
import { segmentDocument } from "@/lib/segmentation/segment";

// Ruído de diagramação dos ebooks do DUO que não pode sobrar no texto publicado.
const LAYOUT_NOISE = /EBOOK DE RETA FINAL|E B O O K|Extensivo Inteligente|Atualizado em \d{2}\/\d{2}\/\d{4}\s*P[áa]gina|^\s*P[áa]gina \d+\s*$/;
const key = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tocLabel = (text: string) => text.replace(/\s*\.{3,}\s*\d+\s*$/, "").trim();

// Título do sumário tem seção se casa com uma seção ou com um capítulo que aparece no caminho das subseções.
export function tocCoverage(toc: string[], draft: DraftSection[]): { matched: number; unmatched: string[] } {
  const sectionKeys = new Set(draft.flatMap((section) => [key([section.numbering, section.title].filter(Boolean).join(" ")), key(section.title ?? "")]));
  const pathKeys = new Set(draft.flatMap((section) => section.path.map(key)));
  const unmatched = toc.filter((label) => !sectionKeys.has(key(label)) && !pathKeys.has(key(label.replace(/^\d{1,2}(?:\.\d{1,2})*\.?\s*/, ""))));
  return { matched: toc.length - unmatched.length, unmatched };
}

export type EbookReport = { sections: number; paragraphs: number; tips: number; residual: string[]; tocEntries: number; tocMatched: number; unmatchedToc: string[]; draft: DraftSection[] };

export async function analyzeEbook(bytes: Uint8Array, format: "pdf" | "docx"): Promise<EbookReport> {
  const cleaned = cleanDocument(await extractOriginal(format, bytes), { mode: "faithful" });
  const segmentation = segmentDocument("ensaio", "ensaio", cleaned.paragraphs);
  const draft = buildDraft(segmentation);
  const paragraphs = draft.flatMap((section) => section.paragraphs);
  const toc = segmentation.ignored.filter((item) => item.reason === "toc_entry").map((item) => tocLabel(item.text));
  const coverage = tocCoverage(toc, draft);
  return { sections: draft.length, paragraphs: paragraphs.length, tips: paragraphs.filter((paragraph) => paragraph.kind === "tip").length, residual: paragraphs.filter((paragraph) => LAYOUT_NOISE.test(paragraph.text)).map((paragraph) => paragraph.text.slice(0, 120)), tocEntries: toc.length, tocMatched: coverage.matched, unmatchedToc: coverage.unmatched, draft };
}

const withIds = (draft: DraftSection[], prefix: string): VersionText => draftToVersionText(draft.map((section, s) => ({ ...section, id: `${prefix}s${s}`, paragraphs: section.paragraphs.map((paragraph, p) => ({ ...paragraph, id: `${prefix}s${s}p${p}` })) })));

function rng(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Sorteia grifos sintéticos (20 a 80 caracteres) na versão base e mede quantos sobrevivem à nova versão.
export function reanchorTrial(base: DraftSection[], next: DraftSection[], count: number, seed: number): { total: number; reanchored: number; orphaned: number } {
  const oldDoc = withIds(base, "o-"), newDoc = withIds(next, "n-");
  const random = rng(seed);
  const candidates = oldDoc.paragraphs.filter((paragraph) => paragraph.text.length >= 40);
  if (!candidates.length) return { total: 0, reanchored: 0, orphaned: 0 };
  const highlights: { id: string; anchor: Anchor }[] = [];
  for (let i = 0; i < count; i += 1) {
    const paragraph = candidates[Math.floor(random() * candidates.length)];
    const length = Math.min(paragraph.text.length, 20 + Math.floor(random() * 61));
    const start = Math.floor(random() * (paragraph.text.length - length + 1));
    highlights.push({ id: `g${i}`, anchor: createAnchor(oldDoc, { paragraphId: paragraph.id, offset: start }, { paragraphId: paragraph.id, offset: start + length }) });
  }
  const results = reanchor(highlights, oldDoc, newDoc);
  const orphaned = results.filter((result) => result.status === "orphaned").length;
  return { total: results.length, reanchored: results.length - orphaned, orphaned };
}
