// Agenda dos flashcards: uma simplificação do algoritmo do Anki (SM-2), contada em dias no calendário de Brasília.
export type Rating = "errei" | "dificil" | "bom" | "facil";
export const RATINGS: { key: Rating; label: string }[] = [
  { key: "errei", label: "Errei" }, { key: "dificil", label: "Difícil" }, { key: "bom", label: "Bom" }, { key: "facil", label: "Fácil" },
];
export const isRating = (value: unknown): value is Rating => RATINGS.some((rating) => rating.key === value);
export type Sched = { intervalDays: number; ease: number; reps: number; lapses: number };

export const START_EASE = 2.5;
const MIN_EASE = 1.3, MAX_EASE = 3, NO_EXAM_CAP = 60;
const DAY = 86_400_000;
const clampEase = (ease: number) => Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, ease)) * 100) / 100;
const toDays = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const fromDays = (days: number) => new Date(days * DAY).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => fromDays(toDays(iso) + days);

// "Hoje" muda à meia-noite de Brasília para todos os alunos.
export const todayBR = (now: Date) => now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// Reta final: nenhum cartão fica para depois da prova (assim todos aparecem antes dela). Sem data de prova, até 60 dias.
function cap(today: string, examDate: string | null): number {
  return examDate ? Math.max(1, toDays(examDate) - toDays(today)) : NO_EXAM_CAP;
}

export function schedule(card: Sched, rating: Rating, today: string, examDate: string | null): Sched & { dueOn: string } {
  const learned = card.reps > 0;
  // Errei: o cartão volta ainda nesta revisão (fica vencido hoje) e recomeça como novo.
  if (rating === "errei") return { intervalDays: 0, ease: learned ? clampEase(card.ease - 0.2) : card.ease, reps: 0, lapses: card.lapses + (learned ? 1 : 0), dueOn: today };
  const ease = clampEase(card.ease + (rating === "facil" ? 0.15 : rating === "dificil" ? -0.15 : 0));
  let interval: number;
  if (card.intervalDays <= 0) interval = rating === "facil" ? 4 : 1;
  else {
    const i = card.intervalDays;
    const good = Math.max(i + 1, Math.round(i * card.ease));
    interval = rating === "dificil" ? Math.max(i + 1, Math.round(i * 1.2)) : rating === "bom" ? good : Math.max(good + 1, Math.round(i * card.ease * 1.3));
  }
  interval = Math.min(interval, cap(today, examDate));
  return { intervalDays: interval, ease, reps: card.reps + 1, lapses: card.lapses, dueOn: addDays(today, interval) };
}

// Texto de cada botão da revisão: quando o cartão volta se o aluno escolher aquela nota.
export function previewLabels(card: Sched, today: string, examDate: string | null): Record<Rating, string> {
  const label = (rating: Rating) => rating === "errei" ? "<10 min" : `${schedule(card, rating, today, examDate).intervalDays} d`;
  return { errei: label("errei"), dificil: label("dificil"), bom: label("bom"), facil: label("facil") };
}
