import { describe, expect, it } from "vitest";
import { piecesOf, tableLayout } from "@/lib/reader/table";

describe("tabela do material no leitor", () => {
  const text = "Elemento | Pergunta | Vício\nCompetência | Quem? | Em regra, sanável\nFinalidade | Pra que? | Insanável";
  it("separa linhas e células sem perder nenhum caractere do texto (os grifos dependem dos deslocamentos)", () => {
    const rows = tableLayout(text)!;
    expect(rows.map((row) => row.map((cell) => text.slice(cell.from, cell.to)))).toEqual([["Elemento", "Pergunta", "Vício"], ["Competência", "Quem?", "Em regra, sanável"], ["Finalidade", "Pra que?", "Insanável"]]);
    // Texto das células + separadores escondidos, na ordem do DOM, reconstrói o original.
    expect(rows.flat().map((cell) => text.slice(cell.from, cell.sepTo)).join("")).toBe(text);
  });
  it("célula vazia (\"A | | B\", depois da limpeza de espaços) não desloca as colunas", () => {
    for (const sample of ["FATO TÍPICO | ILICITUDE | CULPABILIDADE\nConduta | | Dolo ou culpa", "A | B | C\n| meio | ", "A | B | C\n | | fim"]) {
      const rows = tableLayout(sample)!;
      expect(rows.every((row) => row.length === 3)).toBe(true);
      expect(rows.flat().map((cell) => sample.slice(cell.from, cell.sepTo)).join("")).toBe(sample);
    }
    const rows = tableLayout("FATO TÍPICO | ILICITUDE | CULPABILIDADE\nConduta | | Dolo ou culpa")!;
    const text = "FATO TÍPICO | ILICITUDE | CULPABILIDADE\nConduta | | Dolo ou culpa";
    expect(rows[1].map((cell) => text.slice(cell.from, cell.to))).toEqual(["Conduta", "", "Dolo ou culpa"]);
  });
  it("quadro de uma coluna não vira tabela", () => {
    expect(tableLayout("Questão comentada\n[FCC – DPE SP – 2023 – CERTO]")).toBeNull();
  });
  it("recorta os pedaços grifados dentro de cada célula", () => {
    const segments = [{ text: "Competência | Qu", marks: ["g"] }, { text: "em?", marks: [] }];
    expect(piecesOf(segments, 14, 19)).toEqual([{ text: "Qu", marks: ["g"] }, { text: "em?", marks: [] }]);
    expect(piecesOf(segments, 0, 11)).toEqual([{ text: "Competência", marks: ["g"] }]);
  });
});
