import type { DocumentExtraction } from "@/lib/extraction/types";

// Data de atualização que consta no próprio material: o rótulo da versão mostra essa data, não a da publicação.
// Procura "Atualizado em 29/07/2026" (rodapé dos e-books) e, se o texto não trouxer, o nome do arquivo
// ("Vade Esperto - ECA atualizado em 18.09.26", "[atualização 30.07.26]", "- 21.10.26").
const LABELLED = /atualiza(?:do|da|[çc][ãa]o)\s*(?:em\s*)?:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/gi;
const BARE = /(?:^|[\s\-–_[(])(\d{1,2})[.](\d{1,2})[.](\d{4}|\d{2})(?=$|[\s\])_.])/g;

function format(day: string, month: string, year: string): string | null {
  const d = Number(day), m = Number(month), y = year.length === 2 ? 2000 + Number(year) : Number(year);
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2000 || y > 2100) return null;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

// A data que mais aparece (o rodapé repete em toda página); no empate, a mais recente.
function mostFrequent(dates: string[]): string | null {
  const counts = new Map<string, number>();
  for (const date of dates) counts.set(date, (counts.get(date) ?? 0) + 1);
  const key = (date: string) => date.split("/").reverse().join("");
  return [...counts].sort(([a, ca], [b, cb]) => cb - ca || key(b).localeCompare(key(a)))[0]?.[0] ?? null;
}

const datesIn = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => format(match[1], match[2], match[3])).filter((date): date is string => Boolean(date));

export function dateFromText(texts: string[]): string | null {
  return mostFrequent(texts.flatMap((text) => datesIn(text, LABELLED)));
}

export function dateFromFileName(name: string): string | null {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "");
  return mostFrequent(datesIn(base, LABELLED)) ?? mostFrequent(datesIn(base, BARE));
}

// No texto, só cabeçalhos, rodapés e a primeira página: no corpo, "atualizado em" aparece em artigos de lei.
export function materialDate(extraction: Pick<DocumentExtraction, "pages"> | null, fileName: string | null): string | null {
  // Word vem como uma "página" só: da primeira página, só o começo (capa), não o documento inteiro.
  const texts = (extraction?.pages ?? []).flatMap((page, index) => page.blocks.filter((block, position) => (index === 0 && position < 40) || block.kind === "header" || block.kind === "footer").map((block) => block.text));
  return dateFromText(texts) ?? (fileName ? dateFromFileName(fileName) : null);
}
