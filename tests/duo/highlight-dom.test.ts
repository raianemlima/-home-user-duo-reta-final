// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { paragraphSpans, rangeToPoints, segmentText } from "@/lib/highlights/dom";

let root: HTMLElement;
const TEXTS: Record<string, string> = {
  p1: "A assistência judiciária se refere ao patrocínio de advogado.",
  p2: "Critério | Renda\nFamília | até 3 salários",
  p3: "DICA DUO Como usar este material na reta final.",
};

beforeEach(() => {
  document.body.innerHTML = `<div class="section-text" data-section-id="s1">${Object.entries(TEXTS).map(([id, text]) => `<p data-paragraph-id="${id}">${text}</p>`).join("")}</div><h2 id="fora">Fora</h2>`;
  root = document.querySelector(".section-text") as HTMLElement;
});
const text = (id: string) => (root.querySelector(`[data-paragraph-id="${id}"]`) as HTMLElement).firstChild as Text;
function range(startNode: Node, startOffset: number, endNode: Node, endOffset: number) { const r = document.createRange(); r.setStart(startNode, startOffset); r.setEnd(endNode, endOffset); return r; }

describe("rangeToPoints", () => {
  it("seleção começando no meio da palavra dentro de tabela", () => {
    expect(rangeToPoints(range(text("p2"), 3, text("p2"), 22), root)).toEqual({ start: { paragraphId: "p2", offset: 3 }, end: { paragraphId: "p2", offset: 22 } });
  });
  it("seleção dentro da caixa DICA DUO", () => {
    expect(rangeToPoints(range(text("p3"), 9, text("p3"), 25), root)).toEqual({ start: { paragraphId: "p3", offset: 9 }, end: { paragraphId: "p3", offset: 25 } });
  });
  it("seleção atravessando dois parágrafos", () => {
    expect(rangeToPoints(range(text("p1"), 38, text("p2"), 8), root)).toEqual({ start: { paragraphId: "p1", offset: 38 }, end: { paragraphId: "p2", offset: 8 } });
  });
  it("seleção fora dos parágrafos ou vazia: null", () => {
    const outside = document.getElementById("fora")?.firstChild as Text;
    expect(rangeToPoints(range(text("p1"), 2, outside, 2), root)).toBeNull();
    expect(rangeToPoints(range(text("p1"), 5, text("p1"), 5), root)).toBeNull();
  });
  it("conta o texto já dividido por marcações de outros grifos", () => {
    const p = root.querySelector('[data-paragraph-id="p1"]') as HTMLElement;
    p.innerHTML = 'A assistência <mark data-highlight-id="h">judiciária</mark> se refere ao patrocínio de advogado.';
    const after = p.lastChild as Text;
    expect(rangeToPoints(range(after, 4, after, 10), root)).toEqual({ start: { paragraphId: "p1", offset: 28 }, end: { paragraphId: "p1", offset: 34 } });
    const inside = (p.querySelector("mark") as HTMLElement).firstChild as Text;
    expect(rangeToPoints(range(inside, 0, after, 3), root)?.start).toEqual({ paragraphId: "p1", offset: 14 });
  });
  it("início num elemento (fronteira do parágrafo) é tratado como offset 0", () => {
    const p = root.querySelector('[data-paragraph-id="p3"]') as HTMLElement;
    expect(rangeToPoints(range(p, 0, text("p3"), 8), root)).toEqual({ start: { paragraphId: "p3", offset: 0 }, end: { paragraphId: "p3", offset: 8 } });
  });
});

describe("pintura dos grifos (ida e volta)", () => {
  it("paragraphSpans distribui um grifo de vários parágrafos", () => {
    const spans = paragraphSpans(["p1", "p2", "p3"], [{ id: "h", color: "importante", start: { paragraphId: "p1", offset: 38 }, end: { paragraphId: "p3", offset: 8 } }]);
    expect(spans.get("p1")).toEqual([{ id: "h", color: "importante", from: 38, to: null }]);
    expect(spans.get("p2")).toEqual([{ id: "h", color: "importante", from: 0, to: null }]);
    expect(spans.get("p3")).toEqual([{ id: "h", color: "importante", from: 0, to: 8 }]);
  });
  it("segmentText cobre o texto inteiro, sem perder nem duplicar caracteres, com sobreposição", () => {
    const segments = segmentText("abcdefghij", [{ id: "a", color: "importante", from: 2, to: 6 }, { id: "b", color: "revisar", from: 4, to: null }]);
    expect(segments.map((segment) => segment.text).join("")).toBe("abcdefghij");
    expect(segments).toEqual([
      { text: "ab", marks: [] }, { text: "cd", marks: [{ id: "a", color: "importante" }] },
      { text: "ef", marks: [{ id: "a", color: "importante" }, { id: "b", color: "revisar" }] }, { text: "ghij", marks: [{ id: "b", color: "revisar" }] },
    ]);
  });
  it("pintar e selecionar de volta devolve os mesmos pontos", () => {
    const p = root.querySelector('[data-paragraph-id="p1"]') as HTMLElement;
    const segments = segmentText(TEXTS.p1, [{ id: "h", color: "importante", from: 14, to: 24 }]);
    p.innerHTML = segments.map((segment) => (segment.marks.length ? `<mark>${segment.text}</mark>` : segment.text)).join("");
    const mark = p.querySelector("mark")?.firstChild as Text;
    expect(rangeToPoints(range(mark, 0, mark, mark.length), root)).toEqual({ start: { paragraphId: "p1", offset: 14 }, end: { paragraphId: "p1", offset: 24 } });
  });
});
