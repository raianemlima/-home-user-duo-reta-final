import { describe, expect, it } from "vitest";
import { FRASES, fraseDoDia } from "@/lib/frases";

describe("frase do dia", () => {
  it("a mesma o dia inteiro em Brasília, outra no dia seguinte", () => {
    expect(fraseDoDia(new Date("2026-11-21T03:30:00Z"))).toBe(fraseDoDia(new Date("2026-11-22T02:30:00Z"))); // 00h30 e 23h30 do dia 21 em Brasília
    expect(fraseDoDia(new Date("2026-11-21T12:00:00Z"))).not.toBe(fraseDoDia(new Date("2026-11-22T12:00:00Z")));
  });
  it("percorre a lista inteira antes de repetir, sem frases repetidas ou vazias", () => {
    const start = Date.parse("2026-01-01T12:00:00Z");
    const seen = new Set(Array.from({ length: FRASES.length }, (_, day) => fraseDoDia(new Date(start + day * 86_400_000))));
    expect(seen.size).toBe(FRASES.length);
    expect(new Set(FRASES).size).toBe(FRASES.length);
    expect(FRASES.every((frase) => frase.trim().length > 10 && frase.length < 200)).toBe(true);
  });
});
