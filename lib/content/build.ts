import { normalize } from "@/lib/highlights/normalize";
import type { VersionText } from "@/lib/highlights/types";
import { sha256 } from "@/lib/pipeline/hash";
import type { SegmentationResult } from "@/lib/segmentation/types";

export type DraftParagraph = { position: number; kind: "body" | "table" | "footnote" | "tip"; text: string; hash: string };
export type DraftSection = { position: number; level: number; numbering: string | null; title: string | null; path: string[]; paragraphs: DraftParagraph[] };

export const paragraphHash = (text: string) => sha256(normalize(text).trim());

// Uma seção por segmento com conteúdo próprio; títulos sem conteúdo (contêineres) só aparecem no caminho dos filhos.
// Trechos longos já vêm inteiros em `paragraphs` (as janelas de leitura do atelie não importam aqui).
export function buildDraft(segmentation: SegmentationResult): DraftSection[] {
  return segmentation.segments
    .filter((segment) => segment.paragraphs.length > 0)
    .map((segment, index) => ({
      position: index + 1,
      level: segment.level,
      numbering: segment.numbering,
      title: segment.title,
      path: segment.path,
      paragraphs: segment.paragraphs.map((paragraph, k) => ({ position: k + 1, kind: paragraph.kind, text: paragraph.text, hash: paragraphHash(paragraph.text) })),
    }));
}

type Stored = Pick<DraftSection, "title" | "path"> & { id: string; paragraphs: (Pick<DraftParagraph, "position" | "text" | "hash"> & { id: string })[] };

// Seções e parágrafos já ordenados → texto da versão para âncoras. O caminho inclui o título da própria seção.
export function draftToVersionText(sections: Stored[]): VersionText {
  return { paragraphs: sections.flatMap((section) => section.paragraphs.map((paragraph) => ({ id: paragraph.id, sectionId: section.id, sectionPath: [...section.path, section.title ?? ""], position: paragraph.position, hash: paragraph.hash, text: paragraph.text }))) };
}
