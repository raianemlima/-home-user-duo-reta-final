export type HeadingKind = "structural" | "numbered" | "article" | "styled";
export type HeadingInfo = { kind: HeadingKind; level: number; numbering: string | null; title: string; needsContinuation?: boolean };

// "CAPÍTULO VII-A", "Título IX-A": divisões incluídas depois na lei também são títulos.
const STRUCTURAL = /^(LIVRO|PARTE|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+((?:[IVXLCDM]+|\d+)(?:-[A-Z])?|[ÚU]NICO|GERAL|ESPECIAL)(?![\p{L}\d])[\s\-–—:.]*(.*)$/iu;
const STRUCTURAL_LEVEL: Record<string, number> = { LIVRO: 1, PARTE: 1, TITULO: 1, CAPITULO: 2, SECAO: 3, SUBSECAO: 4 };
// O número fica como está escrito ("1.", "6.1.", "2)"): o leitor mostra o título igual ao arquivo.
const NUMBERED = /^((\d{1,2}(?:\.\d{1,2}){0,3})[.)]?)\s+(\p{Lu}.{2,150})$/u;
const ARTICLE = /^Art(?:igos?)?\.?\s*(\d+(?:\.\d+)*)\s*[º°o]?(?:\s?-([A-Z]))?(?![\p{L}\d])/iu;
// Como a lei cita: ordinal até o 9º ("Art. 9º"), cardinal a partir do 10 ("Art. 10"), com a letra dos incluídos ("Art. 3º-B").
const articleLabel = (number: string, letter?: string) => `Art. ${number}${/^[1-9]$/.test(number) ? "º" : ""}${letter ? `-${letter.toUpperCase()}` : ""}`;
const TOC_ENTRY = /\.{4,}\s*\d{1,4}\s*$/;
const TOC_TITLE = /^(sum[áa]rio|[íi]ndice|conte[úu]do)$/i;

const strip = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export const isTocEntry = (text: string) => TOC_ENTRY.test(text);
export const isTocTitle = (text: string) => TOC_TITLE.test(text.trim());

export function classifyHeading(text: string, styled: boolean): HeadingInfo | null {
  const value = text.trim();
  if (!value || isTocEntry(value)) return null;
  // Artigo de lei é um parágrafo inteiro (pode ser longo): reconhecido pelo início, sem limite de tamanho.
  const article = ARTICLE.exec(value);
  if (article) { const label = articleLabel(article[1], article[2]); return { kind: "article", level: 9, numbering: label, title: label }; }
  if (value.length > 200) return null;
  const structural = STRUCTURAL.exec(value);
  if (structural) {
    const rest = structural[3].trim();
    return { kind: "structural", level: STRUCTURAL_LEVEL[strip(structural[1])] ?? 2, numbering: `${structural[1]} ${structural[2]}`, title: rest, needsContinuation: rest === "" };
  }
  const numbered = NUMBERED.exec(value);
  // "3. Confissão Retratada:" sem estilo de título é item de lista que abre uma explicação, não seção.
  if (numbered && value.length <= 140 && !/[;,]$/.test(value) && (styled || !/:$/.test(value))) {
    const remainder = numbered[3].trim();
    const allCaps = remainder === remainder.toUpperCase();
    if (!/\.$/.test(remainder) || styled || allCaps) return { kind: "numbered", level: numbered[2].split(".").length, numbering: numbered[1], title: remainder };
  }
  if (styled && value.length <= 120 && !/[;,]$/.test(value)) return { kind: "styled", level: 0, numbering: null, title: value };
  return null;
}
