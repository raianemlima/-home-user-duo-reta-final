import { describe, expect, it } from "vitest";
import { dateFromFileName, dateFromText, materialDate } from "@/lib/content/material-date";

const page = (blocks: [string, string][]) => ({ blocks: blocks.map(([kind, text]) => ({ kind, text })) }) as never;

describe("data que consta no material", () => {
  it("lê o rodapé dos e-books (a mais frequente) e ignora 'atualizado' no corpo depois da 1ª página", () => {
    const extraction = { pages: [page([["body", "Ebook de Reta Final"]]), page([["body", "o valor será atualizado em 10/10/2020"], ["footer", "Cursos DUO · Extensivo Inteligente · Atualizado em 29/07/2026 Página 2"]]), page([["footer", "Cursos DUO · Atualizado em 29/07/2026 Página 3"]])] };
    expect(materialDate(extraction, "EBOOK - Penal - 21.10.26.pdf")).toBe("29/07/2026");
  });
  it("sem data no texto, usa o nome do arquivo", () => {
    expect(materialDate({ pages: [page([["body", "Dos Princípios Fundamentais"]])] }, "Vade Esperto - ECA atualizado em 18.09.26.docx")).toBe("18/09/2026");
    expect(dateFromFileName("Vade Esperto - CP [atualização 30.07.26].docx")).toBe("30/07/2026");
    expect(dateFromFileName("Vade Esperto - LEP - atualizado em 10.12.2025.docx")).toBe("10/12/2025");
    expect(dateFromFileName("EBOOK - Reta Final - DPE - SP - Direto Penal - 21.10.26.pdf")).toBe("21/10/2026");
    expect(dateFromFileName("Vade Esperto - CF.docx")).toBeNull();
    expect(materialDate(null, "Vade Esperto - Civil.docx")).toBeNull();
  });
  it("datas inválidas não valem", () => {
    expect(dateFromText(["Atualizado em 45/13/2026"])).toBeNull();
  });
});
