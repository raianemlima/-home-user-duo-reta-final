import { describe, expect, it } from "vitest";
import { boxColors, contrast, paragraphProps, readableColor, spanProps, withMarks } from "@/lib/formatting/render";

describe("cores legíveis nos dois temas", () => {
  it("cor que já passa fica igual; as outras escurecem (claro) ou clareiam (escuro) até 4,5:1", () => {
    expect(readableColor("#1a7a3c", "light")).toBe("#1a7a3c");
    for (const color of ["#1a7a3c", "#0563c1", "#ffffff", "#c3fdbb", "#ff0000", "#000000", "#7f7f7f"]) {
      const light = readableColor(color, "light"), dark = readableColor(color, "dark");
      for (const background of ["#ffffff", "#f7f6f1", "#efeee7"]) expect(contrast(light, background)).toBeGreaterThanOrEqual(4.5);
      for (const background of ["#14201a", "#1b2a22", "#24362c"]) expect(contrast(dark, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("caixa: fundo claro no tema claro, escuro no escuro, texto do tema legível nos dois", () => {
    const box = boxColors("#c3fdbb");
    expect(box.light).toBe("#c3fdbb");
    expect(contrast("#231f1e", box.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#f2f1ea", box.dark)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#231f1e", boxColors("#17401f").light)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("divisão do texto pelas marcas", () => {
  it("parte os trechos dos grifos nos limites das marcas, sem mudar o texto", () => {
    const text = "Crime é fato típico, ilícito e culpável.";
    const segments = [{ text: "Crime", marks: ["g1"] }, { text: text.slice(5), marks: [] }];
    const pieces = withMarks(segments, [[3, 8, "b"], [13, 19, "iu", "#1a7a3c"]]);
    expect(pieces.map((piece) => piece.text).join("")).toBe(text);
    expect(pieces.map((piece) => [piece.text, piece.marks.length, piece.fmt?.style ?? null, piece.fmt?.color ?? null])).toEqual([
      ["Cri", 1, null, null], ["me", 1, "b", null], [" é ", 0, "b", null], ["fato ", 0, null, null], ["típico", 0, "iu", "#1a7a3c"], [", ilícito e culpável.", 0, null, null],
    ]);
    expect(withMarks(segments, undefined).map((piece) => piece.fmt)).toEqual([null, null]);
  });
  it("classes do parágrafo e do trecho; cor ajustada por tema", () => {
    expect(paragraphProps({ indent: 3, bullet: "check", box: "#c3fdbb" })).toMatchObject({ className: "fx-indent-3 fx-box fx-bullet", bullet: "✔" });
    expect(paragraphProps(null)).toEqual({ className: "" });
    expect(spanProps({ style: "bu", color: "#ffffff" })).toEqual({ className: "fx fx-b fx-u fx-c", style: { "--fx-l": readableColor("#ffffff", "light"), "--fx-d": "#ffffff" } });
    expect(spanProps({ style: "i", color: "javascript:alert(1)" })).toEqual({ className: "fx fx-i", style: undefined });
  });
});
