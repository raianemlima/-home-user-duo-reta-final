// Lacunas dos flashcards: o aluno toca nas palavras do trecho que quer esconder. Cada lacuna é um intervalo [início, fim)
// do texto do cartão; palavras vizinhas escondidas viram uma lacuna só ("prazo em dobro").
export type Gap = [number, number];
export const MAX_GAPS = 60;
const WORDY = /[\p{L}\p{N}]/u;

// Palavras do texto, sem a pontuação das pontas: "(art." → "art", "dobro." → "dobro".
export function wordsOf(text: string): { start: number; end: number }[] {
  const words: { start: number; end: number }[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    let start = match.index, end = match.index + match[0].length;
    while (start < end && !WORDY.test(text[start])) start++;
    while (end > start && !WORDY.test(text[end - 1])) end--;
    if (end > start) words.push({ start, end });
  }
  return words;
}

export function gapsFrom(text: string, wordIndexes: number[]): Gap[] {
  const words = wordsOf(text);
  const picked = [...new Set(wordIndexes)].filter((index) => words[index]).sort((a, b) => a - b);
  const gaps: Gap[] = [];
  let previous = -2;
  for (const index of picked) {
    if (index === previous + 1 && gaps.length) gaps[gaps.length - 1][1] = words[index].end;
    else gaps.push([words[index].start, words[index].end]);
    previous = index;
  }
  return gaps;
}

// Índices das palavras cobertas pelas lacunas (para editar um cartão já salvo).
export function wordIndexesIn(text: string, gaps: Gap[]): number[] {
  return wordsOf(text).flatMap((word, index) => gaps.some(([start, end]) => word.start >= start && word.end <= end) ? [index] : []);
}

export function validGaps(text: string, gaps: unknown): gaps is Gap[] {
  if (!Array.isArray(gaps) || gaps.length === 0 || gaps.length > MAX_GAPS) return false;
  let last = 0;
  for (const gap of gaps) {
    if (!Array.isArray(gap) || gap.length !== 2 || !Number.isInteger(gap[0]) || !Number.isInteger(gap[1])) return false;
    const [start, end] = gap as number[];
    if (start < last || end <= start || end > text.length || !WORDY.test(text.slice(start, end))) return false;
    last = end;
  }
  return true;
}

export function maskPieces(text: string, gaps: Gap[]): { text: string; gap: boolean }[] {
  const pieces: { text: string; gap: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of gaps) {
    if (start > cursor) pieces.push({ text: text.slice(cursor, start), gap: false });
    pieces.push({ text: text.slice(start, end), gap: true });
    cursor = end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), gap: false });
  return pieces;
}
