import { describe, expect, it } from "vitest";
import { gapsFrom, maskPieces, validGaps, wordsOf } from "@/lib/flashcards/cloze";
import { previewLabels, schedule, todayBR } from "@/lib/flashcards/schedule";

const NEW = { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };
const MATURE = { intervalDays: 10, ease: 2.5, reps: 3, lapses: 0 };
const TODAY = "2026-11-21";

describe("agenda dos flashcards (estilo Anki)", () => {
  it("cartão novo: Difícil e Bom voltam amanhã, Fácil em 4 dias", () => {
    expect(schedule(NEW, "dificil", TODAY, null)).toMatchObject({ intervalDays: 1, dueOn: "2026-11-22", reps: 1 });
    expect(schedule(NEW, "bom", TODAY, null)).toMatchObject({ intervalDays: 1, dueOn: "2026-11-22", reps: 1, ease: 2.5 });
    expect(schedule(NEW, "facil", TODAY, null)).toMatchObject({ intervalDays: 4, dueOn: "2026-11-25", ease: 2.65 });
  });
  it("cartão maduro: Difícil × 1,2, Bom × facilidade, Fácil × facilidade × 1,3", () => {
    expect(schedule(MATURE, "dificil", TODAY, null)).toMatchObject({ intervalDays: 12, ease: 2.35 });
    expect(schedule(MATURE, "bom", TODAY, null)).toMatchObject({ intervalDays: 25, ease: 2.5, dueOn: "2026-12-16" });
    expect(schedule(MATURE, "facil", TODAY, null)).toMatchObject({ intervalDays: 33, ease: 2.65 });
  });
  it("Errei: volta hoje, recomeça e só conta lapso em cartão já aprendido", () => {
    expect(schedule(MATURE, "errei", TODAY, null)).toEqual({ intervalDays: 0, ease: 2.3, reps: 0, lapses: 1, dueOn: TODAY });
    expect(schedule(NEW, "errei", TODAY, null)).toEqual({ intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, dueOn: TODAY });
  });
  it("a facilidade fica entre 1,3 e 3", () => {
    expect(schedule({ ...MATURE, ease: 1.35 }, "errei", TODAY, null).ease).toBe(1.3);
    expect(schedule({ ...MATURE, ease: 2.95 }, "facil", TODAY, null).ease).toBe(3);
  });
  it("nenhum intervalo passa da prova; sem prova, o teto é 60 dias", () => {
    expect(schedule(MATURE, "bom", TODAY, "2026-11-26").intervalDays).toBe(5);
    expect(schedule(MATURE, "facil", TODAY, "2026-11-21").intervalDays).toBe(1);
    expect(schedule(MATURE, "bom", TODAY, "2026-10-01").intervalDays).toBe(1);
    expect(schedule({ ...MATURE, intervalDays: 50 }, "bom", TODAY, null).intervalDays).toBe(60);
  });
  it("hoje no fuso de Brasília e rótulos dos botões", () => {
    expect(todayBR(new Date("2026-11-22T02:00:00Z"))).toBe("2026-11-21");
    expect(previewLabels(MATURE, TODAY, null)).toEqual({ errei: "<10 min", dificil: "12 d", bom: "25 d", facil: "33 d" });
  });
});

describe("lacunas", () => {
  it("palavras sem a pontuação das pontas", () => {
    const text = "Prazo em dobro.";
    expect(wordsOf(text).map((word) => text.slice(word.start, word.end))).toEqual(["Prazo", "em", "dobro"]);
    expect(wordsOf("(art. 5º, LXXIV)").map((word) => "(art. 5º, LXXIV)".slice(word.start, word.end))).toEqual(["art", "5º", "LXXIV"]);
  });
  it("palavras vizinhas viram uma só lacuna", () => {
    const text = "A Defensoria tem prazo em dobro.";
    expect(gapsFrom(text, [3, 5, 4])).toEqual([[17, 31]]);
    expect(gapsFrom(text, [1, 5])).toEqual([[2, 12], [26, 31]]);
    expect(maskPieces(text, [[26, 31]])).toEqual([{ text: "A Defensoria tem prazo em ", gap: false }, { text: "dobro", gap: true }, { text: ".", gap: false }]);
  });
  it("recusa lacunas vazias, sobrepostas, fora do texto ou só com espaço e pontuação", () => {
    const text = "Prazo em dobro.";
    expect(validGaps(text, [[9, 14]])).toBe(true);
    expect(validGaps(text, [])).toBe(false);
    expect(validGaps(text, [[0, 5], [3, 8]])).toBe(false);
    expect(validGaps(text, [[9, 40]])).toBe(false);
    expect(validGaps(text, [[14, 15]])).toBe(false);
    expect(validGaps(text, [[5, 6]])).toBe(false);
    expect(validGaps(text, [[2.5, 4] as [number, number]])).toBe(false);
  });
});
