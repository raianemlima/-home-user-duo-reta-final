import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXAM_DATE } from "@/lib/exam";
import type { Gap } from "@/lib/flashcards/cloze";
import type { Sched } from "@/lib/flashcards/schedule";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError } from "@/lib/server/http";

// Data da prova usada como teto da agenda (nenhum cartão fica para depois dela).
export const FLASHCARD_EXAM_DATE: string | null = EXAM_DATE;
export const MAX_TEXTO = 1500, MAX_PERGUNTA = 300, MAX_CARDS = 3000;
export const CARD_COLUMNS = "id, discipline_id, section_id, origem, tipo, texto, pergunta, lacunas, due_on, interval_days, ease, reps, lapses";

export type CardView = Sched & { id: string; tipo: "lacuna" | "pergunta"; texto: string; pergunta: string | null; lacunas: Gap[]; origem: string; disciplineSlug: string | null; disciplineTitle: string | null; sectionId: string | null; dueOn: string };
type Row = Record<string, unknown>;

export const schedOf = (row: Row): Sched => ({ intervalDays: Number(row.interval_days ?? 0), ease: Number(row.ease ?? 2.5), reps: Number(row.reps ?? 0), lapses: Number(row.lapses ?? 0) });

export function toCardView(row: Row, discipline?: { slug: string; title: string } | null, sectionAlive = false): CardView {
  return { id: row.id as string, tipo: row.tipo as CardView["tipo"], texto: row.texto as string, pergunta: (row.pergunta as string | null) ?? null, lacunas: (row.lacunas as Gap[]) ?? [], origem: (row.origem as string) ?? "", disciplineSlug: discipline?.slug ?? null, disciplineTitle: discipline?.title ?? null, sectionId: sectionAlive ? (row.section_id as string) : null, dueOn: row.due_on as string, ...schedOf(row) };
}

// Banco sem a migração 0022: a tela mostra "indisponível" em vez de quebrar.
export const missingTable = (error: { code?: string; message?: string }) => error.code === "42P01" || error.code === "PGRST205" || (/flashcards/.test(error.message ?? "") && /(does not exist|could not find)/i.test(error.message ?? ""));
export function failure(error: { code?: string; message?: string }, what: string): never {
  if (missingTable(error)) throw new ApiError(503, "unavailable", "Os flashcards ainda não estão disponíveis.");
  throw new Error(`Falha ao ${what}: ${error.message}`);
}

// Todos os cartões do aluno, em páginas de 1000 (limite do PostgREST).
export async function listCards(supabase: SupabaseClient, userId: string): Promise<{ rows: Row[]; error: { code?: string; message?: string } | null }> {
  const rows: Row[] = [];
  for (let from = 0; from < MAX_CARDS + 1000; from += 1000) {
    const { data, error } = await supabase.from("flashcards").select(CARD_COLUMNS).eq("user_id", userId).order("created_at", { ascending: true }).range(from, from + 999);
    if (error) return { rows: [], error };
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  return { rows, error: null };
}

// Disciplinas dos cartões e seções que ainda existem na versão publicada (para o link "Ver no material").
export async function cardContext(supabase: SupabaseClient, rows: Row[]) {
  const disciplineIds = [...new Set(rows.map((row) => row.discipline_id).filter(Boolean))] as string[];
  const sectionIds = [...new Set(rows.map((row) => row.section_id).filter(Boolean))] as string[];
  const disciplines = new Map<string, { slug: string; title: string }>();
  const alive = new Set<string>();
  if (disciplineIds.length) {
    const { data } = await supabase.from("disciplines").select("id, slug, title").in("id", disciplineIds);
    for (const row of (data ?? []) as Row[]) disciplines.set(row.id as string, { slug: row.slug as string, title: row.title as string });
    const { data: versions } = await supabase.from("content_versions").select("id").in("discipline_id", disciplineIds).eq("status", "published");
    const published = new Set(((versions ?? []) as Row[]).map((row) => row.id));
    for (let i = 0; i < sectionIds.length; i += 200) {
      const { data: sections } = await supabase.from("sections").select("id, version_id").in("id", sectionIds.slice(i, i + 200));
      for (const row of (sections ?? []) as Row[]) if (published.has(row.version_id)) alive.add(row.id as string);
    }
  }
  return { disciplines, alive };
}

export async function cardIdOf(context: { params: Promise<{ id: string }> }): Promise<string> {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Cartão inválido.");
  return id;
}
