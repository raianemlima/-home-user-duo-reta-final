export type HighlightColor = "importante" | "lei_seca" | "jurisprudencia" | "revisar";

export const HIGHLIGHT_COLORS: { key: HighlightColor; label: string; swatch: string }[] = [
  { key: "importante", label: "Importante", swatch: "#FFE066" },
  { key: "lei_seca", label: "Lei seca", swatch: "#9BE3B0" },
  { key: "jurisprudencia", label: "Jurisprudência", swatch: "#9CC8F5" },
  { key: "revisar", label: "Revisar", swatch: "#F7A8C8" },
];

export const isHighlightColor = (value: unknown): value is HighlightColor => HIGHLIGHT_COLORS.some((color) => color.key === value);

// sectionPath inclui o título da própria seção (ancestrais + ela mesma); compara seções entre versões.
export type ParagraphRef = { id: string; sectionId: string; sectionPath: string[]; position: number; hash: string; text: string };
// Parágrafos na ordem do material (seção, depois posição).
export type VersionText = { paragraphs: ParagraphRef[] };
// Offsets são índices UTF-16 em ParagraphRef.text; o fim é exclusivo.
export type Point = { paragraphId: string; offset: number };
export type Anchor = { start: Point; end: Point; quote: string; prefix: string; suffix: string };
export type ReanchorResult = { highlightId: string; status: "active"; anchor: Anchor } | { highlightId: string; status: "orphaned" };

export const CONTEXT_CHARS = 32;
