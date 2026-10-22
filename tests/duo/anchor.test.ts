import { describe, expect, it } from "vitest";
import { createAnchor } from "@/lib/highlights/anchor";
import { normalizeWithMap } from "@/lib/highlights/normalize";
import type { ParagraphRef, VersionText } from "@/lib/highlights/types";

const p = (id: string, sectionId: string, position: number, text: string, path = [sectionId]): ParagraphRef => ({ id, sectionId, sectionPath: path, position, hash: `h-${id}`, text });
const doc: VersionText = { paragraphs: [
  p("p1", "s1", 1, "A assistência judiciária se refere ao patrocínio de advogado."),
  p("p2", "s1", 2, "Já a assistência jurídica é mais ampla."),
  p("p3", "s2", 1, "A gratuidade da justiça é matéria processual."),
] };

describe("createAnchor", () => {
  it("trecho em dois parágrafos junta as partes com quebra de linha", () => {
    const anchor = createAnchor(doc, { paragraphId: "p1", offset: 38 }, { paragraphId: "p2", offset: 2 });
    expect(anchor.quote).toBe("patrocínio de advogado.\nJá");
    expect(anchor.start).toEqual({ paragraphId: "p1", offset: 38 });
    expect(anchor.end).toEqual({ paragraphId: "p2", offset: 2 });
  });

  it("contexto de 32 caracteres, cortado nas bordas do documento", () => {
    const first = createAnchor(doc, { paragraphId: "p1", offset: 0 }, { paragraphId: "p1", offset: 1 });
    expect(first.prefix).toBe("");
    expect(first.suffix).toBe(" assistência judiciária se refer");
    expect(first.suffix).toHaveLength(32);
    const last = createAnchor(doc, { paragraphId: "p3", offset: 34 }, { paragraphId: "p3", offset: 44 });
    expect(last.quote).toBe("processual");
    expect(last.suffix).toBe(".");
    expect(last.prefix).toHaveLength(32);
  });

  it("recusa intervalo entre seções e intervalo vazio", () => {
    expect(() => createAnchor(doc, { paragraphId: "p2", offset: 0 }, { paragraphId: "p3", offset: 3 })).toThrow();
    expect(() => createAnchor(doc, { paragraphId: "p1", offset: 5 }, { paragraphId: "p1", offset: 5 })).toThrow();
    expect(() => createAnchor(doc, { paragraphId: "p2", offset: 3 }, { paragraphId: "p1", offset: 1 })).toThrow();
    expect(() => createAnchor(doc, { paragraphId: "x", offset: 0 }, { paragraphId: "p1", offset: 1 })).toThrow();
    expect(() => createAnchor(doc, { paragraphId: "p1", offset: 0 }, { paragraphId: "p1", offset: 999 })).toThrow();
  });
});

describe("normalizeWithMap", () => {
  it("unifica aspas, travessões e espaços, mantendo o mapa para o texto original", () => {
    const result = normalizeWithMap("“a”  –  b");
    expect(result.text).toBe('"a" - b');
    expect(result.map).toEqual([0, 1, 2, 3, 5, 6, 8]);
  });
});
