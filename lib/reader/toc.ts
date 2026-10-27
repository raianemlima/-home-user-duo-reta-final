// Sumário do leitor: tipos e funções puras, sem acesso ao banco. Ficam fora de lib/reader/queries.ts porque o
// sumário (componente do navegador) usa chapterBreaks, e importar as consultas levaria junto, para o celular do aluno,
// o código de servidor delas (node:crypto, reancoragem).
export type TocItem = { id: string; level: number; numbering: string | null; title: string | null; path: string[]; chars?: number };
export type Toc = TocItem[];

// Capítulos sem texto próprio não são seções, mas aparecem no caminho das subseções: o sumário mostra o nome deles.
export function chapterBreaks(toc: Toc): Map<string, string> {
  const titles = new Set(toc.map((item) => item.title));
  const breaks = new Map<string, string>();
  let previous: string | undefined;
  for (const item of toc) {
    const chapter = item.path[0];
    if (chapter && !titles.has(chapter) && chapter !== previous) breaks.set(item.id, chapter);
    previous = chapter;
  }
  return breaks;
}
