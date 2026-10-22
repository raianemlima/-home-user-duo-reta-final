import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanDocument } from "@/lib/cleaning/clean";
import { extractOriginal } from "@/lib/extraction";
import { CORPUS_DIR } from "../helpers";

const ebook = async () => extractOriginal("pdf", new Uint8Array(readFileSync(join(CORPUS_DIR, "19-duo-ebook.pdf"))));

describe("limpeza em modo fiel (material do DUO)", () => {
  it("remove cabeçalho, rodapé e número de página repetidos", async () => {
    const result = cleanDocument(await ebook(), { mode: "faithful" });
    const all = result.paragraphs.map((paragraph) => paragraph.text).join("\n");
    expect(all).not.toMatch(/EBOOK DE RETA FINAL/);
    expect(all).not.toMatch(/Extensivo Inteligente/);
    expect(all).not.toMatch(/Página/);
  });

  it("mantém todas as frases do conteúdo, inclusive menções a aula e links", async () => {
    const all = cleanDocument(await ebook(), { mode: "faithful" }).paragraphs.map((paragraph) => paragraph.text).join("\n");
    expect(all).toContain("conforme a aula 3, a Defensoria Pública adota o modelo público");
    expect(all).toContain("A íntegra está em www.planalto.gov.br para consulta.");
  });

  it("parágrafo que começa com DICA DUO vira kind tip", async () => {
    const tip = cleanDocument(await ebook(), { mode: "faithful" }).paragraphs.find((paragraph) => paragraph.text.startsWith("DICA DUO"));
    expect(tip?.kind).toBe("tip");
  });

  it("o modo padrão continua removendo a menção à aula", async () => {
    const all = cleanDocument(await ebook()).paragraphs.map((paragraph) => paragraph.text).join("\n");
    expect(all).not.toContain("conforme a aula 3");
  });
});

describe("extração do ebook do DUO", () => {
  it("cada linha do sumário e a caixa DICA DUO ficam em parágrafos próprios", async () => {
    const texts = cleanDocument(await ebook(), { mode: "faithful" }).paragraphs.map((paragraph) => paragraph.text);
    expect(texts.some((text) => text.startsWith("1.1 Critérios para atendimento pela DPE-SP ....."))).toBe(true);
    expect(texts.some((text) => text.startsWith("DICA DUO Como usar este material"))).toBe(true);
  });
});
