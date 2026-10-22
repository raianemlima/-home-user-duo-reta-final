import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeEbook, reanchorTrial, tocCoverage } from "@/scripts/ensaio/analyze";
import type { DraftSection } from "@/lib/content/build";
import { paragraphHash } from "@/lib/content/build";
import { CORPUS_DIR } from "../helpers";

const ebook = () => new Uint8Array(readFileSync(join(CORPUS_DIR, "19-duo-ebook.pdf")));
const section = (position: number, title: string, texts: string[]): DraftSection => ({ position, level: 1, numbering: String(position), title, path: [], paragraphs: texts.map((text, i) => ({ position: i + 1, kind: "body", text, hash: paragraphHash(text) })) });

describe("analyzeEbook", () => {
  it("conta seções, parágrafos e caixas DICA DUO, sem resíduos de diagramação", async () => {
    const report = await analyzeEbook(ebook(), "pdf");
    expect(report).toMatchObject({ sections: 5, tips: 1, residual: [] });
    expect(report.paragraphs).toBeGreaterThanOrEqual(6);
  });
  it("cada título do sumário tem seção correspondente", async () => {
    const report = await analyzeEbook(ebook(), "pdf");
    expect(report.tocEntries).toBe(4);
    expect(report.tocMatched).toBe(4);
    expect(report.unmatchedToc).toEqual([]);
  });
});

describe("tocCoverage", () => {
  it("capítulo sem texto próprio conta pelo caminho das subseções", () => {
    const draft: DraftSection[] = [{ ...section(1, "Critérios", ["x"]), numbering: "1.1", path: ["MODELOS"] }];
    expect(tocCoverage(["1. MODELOS", "1.1 Critérios", "2. OUTRO"], draft)).toEqual({ matched: 2, unmatched: ["2. OUTRO"] });
  });
});

describe("reanchorTrial", () => {
  const long = (n: number) => `Parágrafo ${n}: a Defensoria Pública é instituição permanente e essencial à função jurisdicional do Estado, número ${n}.`;
  const base = [section(1, "A", [long(1), long(2), long(3)]), section(2, "B", [long(4), long(5)])];
  it("sem mudança, todos os grifos sorteados reancoram", () => {
    expect(reanchorTrial(base, base, 20, 7)).toEqual({ total: 20, reanchored: 20, orphaned: 0 });
  });
  it("parágrafo removido deixa órfãos só os grifos dele; mesma semente, mesmo resultado", () => {
    const next = [section(1, "A", [long(1), long(3)]), section(2, "B", [long(4), long(5)])];
    const first = reanchorTrial(base, next, 30, 11);
    expect(first.orphaned).toBeGreaterThan(0);
    expect(first.reanchored + first.orphaned).toBe(30);
    expect(reanchorTrial(base, next, 30, 11)).toEqual(first);
  });
});
