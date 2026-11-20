// Atividades concluídas do cronograma. O cronograma oficial é uma semana que se repete: cada atividade concluída é
// guardada com a data em que o aluno a fez (a segunda-feira desta semana, por exemplo) e o título dela.

export const MAX_ACTIVITY_TITLE = 200;
// Uma consulta cobre no máximo dois meses (a tela pede a semana; o histórico, no máximo isso).
export const MAX_RANGE_DAYS = 62;

const pad = (value: number) => String(value).padStart(2, "0");
// Data local (não UTC): à noite no Brasil o UTC já é o dia seguinte.
export const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && year >= 2020 && year <= 2100;
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// Datas da semana (segunda a domingo) que contém "today", por dia da semana (0 = domingo … 6 = sábado).
export function weekDates(today: Date): Record<number, string> {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const out: Record<number, string> = {};
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
    out[date.getDay()] = isoDate(date);
  }
  return out;
}

// Chave de cada atividade do dia: o título; repetido no mesmo dia, ganha " (2)", " (3)"…
export function activityKeys(titles: string[]): string[] {
  const seen = new Map<string, number>();
  return titles.map((title) => {
    const base = title.replace(/\s+/g, " ").trim().slice(0, MAX_ACTIVITY_TITLE - 4) || "Atividade";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count > 1 ? `${base} (${count})` : base;
  });
}
