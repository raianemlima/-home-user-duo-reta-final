import { beforeEach, describe, expect, it, vi } from "vitest";
import { activityKeys, isIsoDate, weekDates } from "@/lib/study-progress";

const student = vi.fn();
// Tabela study_activity_done simulada (a sessão do aluno, com RLS).
let rows: { user_id: string; dia: string; atividade: string }[] = [];
let failure: { code?: string; message: string } | null = null;
const calls: string[] = [];
const supabase = { from: (table: string) => {
  calls.push(table);
  const filters: [string, string, string][] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: string) => { filters.push(["eq", column, value]); return query; },
    gte: (column: string, value: string) => { filters.push(["gte", column, value]); return query; },
    lte: (column: string, value: string) => { filters.push(["lte", column, value]); return Promise.resolve(failure ? { data: null, error: failure } : { data: rows.filter((row) => filters.every(([op, column, value]) => op === "eq" ? row[column as keyof typeof row] === value : op === "gte" ? row.dia >= value : row.dia <= value)), error: null }); },
    upsert: async (row: { user_id: string; dia: string; atividade: string }) => { if (failure) return { error: failure }; rows = rows.filter((other) => !(other.user_id === row.user_id && other.dia === row.dia && other.atividade === row.atividade)); rows.push(row); return { error: null }; },
    delete: () => {
      const chain = { eq: (column: string, value: string) => { filters.push(["eq", column, value]); return filters.length === 3 ? (rows = rows.filter((row) => !filters.every(([, c, v]) => row[c as keyof typeof row] === v)), Promise.resolve({ error: failure })) : chain; } };
      return chain;
    },
  };
  return query;
} };
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
import { GET, PUT } from "@/app/api/cronograma/progresso/route";

const put = (body: unknown) => PUT(new Request("http://app/api/cronograma/progresso", { method: "PUT", body: JSON.stringify(body) }));
const get = (query: string) => GET(new Request(`http://app/api/cronograma/progresso?${query}`));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  student.mockResolvedValue({ supabase, user: { id: "u1" } });
  rows = []; failure = null; calls.length = 0;
});

describe("datas e chaves das atividades", () => {
  it("semana de segunda a domingo, em data local", () => {
    // Quinta-feira, 19/11/2026, à noite (no UTC já seria sexta).
    const week = weekDates(new Date(2026, 10, 19, 23, 30));
    expect(week).toEqual({ 1: "2026-11-16", 2: "2026-11-17", 3: "2026-11-18", 4: "2026-11-19", 5: "2026-11-20", 6: "2026-11-21", 0: "2026-11-22" });
    // Domingo pertence à semana que começou na segunda anterior.
    expect(weekDates(new Date(2026, 10, 22, 9))[1]).toBe("2026-11-16");
    // Virada de mês.
    expect(weekDates(new Date(2026, 11, 1))[0]).toBe("2026-12-06");
  });
  it("valida datas de verdade", () => {
    expect(isIsoDate("2026-11-20")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("20/11/2026")).toBe(false);
    expect(isIsoDate(20261120)).toBe(false);
  });
  it("título repetido no mesmo dia ganha número", () => {
    expect(activityKeys(["Questões do dia", "Trilha  de Penal ", "Questões do dia"])).toEqual(["Questões do dia", "Trilha de Penal", "Questões do dia (2)"]);
  });
});

describe("API de atividades concluídas", () => {
  it("marca, lista na semana e desmarca", async () => {
    expect((await put({ dia: "2026-11-16", atividade: "Trilha de Direito Penal", concluida: true })).status).toBe(200);
    await put({ dia: "2026-11-17", atividade: "Questões do dia", concluida: true });
    await put({ dia: "2026-11-30", atividade: "Questões do dia", concluida: true }); // outra semana
    const listed = await (await get("de=2026-11-16&ate=2026-11-22")).json();
    expect(listed).toEqual({ disponivel: true, feitas: [{ dia: "2026-11-16", atividade: "Trilha de Direito Penal" }, { dia: "2026-11-17", atividade: "Questões do dia" }] });
    await put({ dia: "2026-11-16", atividade: "Trilha de Direito Penal", concluida: false });
    expect((await (await get("de=2026-11-16&ate=2026-11-22")).json()).feitas).toEqual([{ dia: "2026-11-17", atividade: "Questões do dia" }]);
    expect(rows.every((row) => row.user_id === "u1")).toBe(true);
  });
  it("marcar duas vezes não duplica", async () => {
    await put({ dia: "2026-11-16", atividade: "Questões do dia", concluida: true });
    await put({ dia: "2026-11-16", atividade: "Questões do dia", concluida: true });
    expect(rows).toHaveLength(1);
  });
  it("recusa dados inválidos", async () => {
    expect((await put({ dia: "2026-13-01", atividade: "X", concluida: true })).status).toBe(400);
    expect((await put({ dia: "2026-11-16", atividade: "", concluida: true })).status).toBe(400);
    expect((await put({ dia: "2026-11-16", atividade: "x".repeat(201), concluida: true })).status).toBe(400);
    expect((await put({ dia: "2026-11-16", atividade: "X", concluida: "sim" })).status).toBe(400);
    expect((await get("de=2026-11-22&ate=2026-11-16")).status).toBe(400);
    expect((await get("de=2026-01-01&ate=2026-12-31")).status).toBe(400);
    expect(rows).toEqual([]);
  });
  it("sem a migração 0021 aplicada, a tela recebe 'indisponível' em vez de erro", async () => {
    failure = { code: "PGRST205", message: "Could not find the table 'public.study_activity_done' in the schema cache" };
    expect(await (await get("de=2026-11-16&ate=2026-11-22")).json()).toEqual({ disponivel: false, feitas: [] });
    expect((await put({ dia: "2026-11-16", atividade: "X", concluida: true })).status).toBe(503);
  });
  it("só aluno logado", async () => {
    const { ApiError } = await import("@/lib/server/http");
    student.mockRejectedValue(new ApiError(401, "unauthorized", "Entre para continuar."));
    expect((await put({ dia: "2026-11-16", atividade: "X", concluida: true })).status).toBe(401);
  });
});
