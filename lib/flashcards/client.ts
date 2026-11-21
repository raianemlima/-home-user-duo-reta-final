import type { Gap } from "@/lib/flashcards/cloze";
import type { Sched } from "@/lib/flashcards/schedule";

// Cartão como a API devolve (mesmo formato de CardView em lib/flashcards/server.ts).
export type Card = Sched & { id: string; tipo: "lacuna" | "pergunta"; texto: string; pergunta: string | null; lacunas: Gap[]; origem: string; disciplineSlug: string | null; disciplineTitle: string | null; sectionId: string | null; dueOn: string };

export async function callApi<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? "Não foi possível falar com o servidor. Tente de novo.");
  return payload as T;
}

export const materialLink = (card: Card) => card.disciplineSlug && card.sectionId ? `/disciplinas/${card.disciplineSlug}/${card.sectionId}` : null;
export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
