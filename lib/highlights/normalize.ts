const DOUBLE_QUOTES = /[“”„‟″«»]/;
const SINGLE_QUOTES = /[‘’‚‛′]/;
const DASHES = /[‐‑‒–—―]/;

// Forma de comparação entre versões: aspas e traços unificados, espaços colapsados. map[i] = índice original do caractere i.
export function normalizeWithMap(text: string): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (/\s/.test(char)) {
      if (out.endsWith(" ")) continue;
      out += " "; map.push(i); continue;
    }
    out += DOUBLE_QUOTES.test(char) ? '"' : SINGLE_QUOTES.test(char) ? "'" : DASHES.test(char) ? "-" : char;
    map.push(i);
  }
  return { text: out, map };
}

export const normalize = (text: string) => normalizeWithMap(text).text;
