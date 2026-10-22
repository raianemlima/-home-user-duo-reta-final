// Data da prova da DPE-SP (horário de Brasília). Troque aqui se o edital mudar.
export const EXAM_DATE = "2027-01-10";
export const EXAM_LABEL = "10 de janeiro de 2027";

const dayOf = (date: Date) => date.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// Dias inteiros até a prova, contados no calendário de Brasília (0 = é hoje; negativo = já passou).
export function daysUntilExam(now: Date, exam = EXAM_DATE): number {
  const today = Date.parse(`${dayOf(now)}T00:00:00Z`), target = Date.parse(`${exam}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

export function examCountdown(now: Date): string {
  const days = daysUntilExam(now);
  if (days > 1) return `Faltam ${days} dias para a prova`;
  if (days === 1) return "A prova é amanhã";
  if (days === 0) return "A prova é hoje. Boa prova!";
  return "A prova já aconteceu";
}

// Versão curta para o menu lateral.
export function examShort(now: Date): string {
  const days = daysUntilExam(now);
  return days > 1 ? `Prova em 10/01/2027 · faltam ${days} dias` : examCountdown(now);
}
