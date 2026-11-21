// Formatação do PDF guardada à parte do texto publicado (paragraphs.format). O texto nunca muda: as marcas são
// intervalos [início, fim) sobre ele, então os grifos dos alunos continuam valendo.

// Um trecho de texto com o mesmo estilo, como o PDF desenha.
export type Run = { text: string; bold: boolean; italic: boolean; underline: boolean; color: string | null; symbol: boolean };

// Uma linha do PDF (zona de corpo da página), com os trechos em ordem e a caixa colorida em que está, se houver.
export type StyledLine = { page: number; y: number; x0: number; textX0: number; fontSize: number; runs: Run[]; box: string | null; marginX: number };

export type StyledDocument = { lines: StyledLine[]; bodyColor: string | null };

// Estilo de uma marca: combinação de "b" (negrito), "i" (itálico) e "u" (sublinhado), na ordem b, i, u.
export type MarkStyle = string;
// [início, fim, estilo, cor?] — cor em "#rrggbb", só quando difere da cor normal do corpo.
export type Mark = [number, number, MarkStyle] | [number, number, MarkStyle, string];

export type ParagraphFormat = { m?: Mark[]; indent?: number; bullet?: "check" | "dot"; box?: string };
