import { describe, expect, it } from "vitest";
import { createAnchor } from "@/lib/highlights/anchor";
import { reanchor } from "@/lib/highlights/reanchor";
import type { Anchor, ParagraphRef, VersionText } from "@/lib/highlights/types";

const p = (id: string, sectionId: string, position: number, text: string, path: string[], hash = `h:${text}`): ParagraphRef => ({ id, sectionId, sectionPath: path, position, hash, text });
const S1 = ["1. MODELOS"], S2 = ["2. AUTONOMIA"];
const oldDoc: VersionText = { paragraphs: [
  p("o1", "os1", 1, "O modelo público adota defensores servidores públicos com remuneração fixa.", S1),
  p("o2", "os1", 2, "O modelo judicare paga advogados particulares.", S1),
  p("o3", "os2", 1, "A autonomia funcional foi assegurada pela EC 45/2004.", S2),
] };
const anchorOf = (start: [string, number], end: [string, number]) => createAnchor(oldDoc, { paragraphId: start[0], offset: start[1] }, { paragraphId: end[0], offset: end[1] });
const one = (anchor: Anchor, next: VersionText) => reanchor([{ id: "g1", anchor }], oldDoc, next)[0];
const quoteAt = (doc: VersionText, anchor: Anchor) => {
  const ids = doc.paragraphs.map((x) => x.id);
  const from = ids.indexOf(anchor.start.paragraphId), to = ids.indexOf(anchor.end.paragraphId);
  const texts = doc.paragraphs.slice(from, to + 1).map((x) => x.text);
  return texts.join("\n").slice(anchor.start.offset, texts.join("\n").length - (texts[texts.length - 1].length - anchor.end.offset));
};

describe("reanchor", () => {
  it("mesmo hash mantém os offsets nos novos ids", () => {
    const anchor = anchorOf(["o2", 2], ["o2", 17]);
    const next: VersionText = { paragraphs: [p("n0", "ns1", 1, "Parágrafo novo inserido antes.", S1), { ...oldDoc.paragraphs[0], id: "n1", sectionId: "ns1", position: 2 }, { ...oldDoc.paragraphs[1], id: "n2", sectionId: "ns1", position: 3 }] };
    const result = one(anchor, next);
    expect(result.status).toBe("active");
    if (result.status !== "active") return;
    expect(result.anchor.start).toEqual({ paragraphId: "n2", offset: 2 });
    expect(result.anchor.end).toEqual({ paragraphId: "n2", offset: 17 });
    expect(result.anchor.quote).toBe("modelo judicare");
  });

  it("parágrafo editado com o trecho ainda presente reancora na seção de mesmo caminho", () => {
    const anchor = anchorOf(["o1", 2], ["o1", 16]);
    const next: VersionText = { paragraphs: [p("n1", "ns1", 1, "Atualização: o modelo público adota defensores concursados.", S1)] };
    const result = one(anchor, next);
    expect(result.status).toBe("active");
    if (result.status === "active") { expect(result.anchor.start.paragraphId).toBe("n1"); expect(quoteAt(next, result.anchor)).toBe("modelo público"); }
  });

  it("trecho que mudou de seção é encontrado na disciplina inteira", () => {
    const anchor = anchorOf(["o3", 2], ["o3", 21]);
    const next: VersionText = { paragraphs: [p("n1", "ns1", 1, "Texto qualquer.", S1), p("n2", "ns9", 1, "Hoje: a autonomia funcional é tema central.", ["3. NOVO"])] };
    const result = one(anchor, next);
    expect(result.status).toBe("active");
    if (result.status === "active") expect(quoteAt(next, result.anchor)).toBe("autonomia funcional");
  });

  it("trecho repetido: o contexto desempata; contexto também igual fica órfão", () => {
    const anchor = anchorOf(["o2", 2], ["o2", 17]);
    const next: VersionText = { paragraphs: [
      p("n1", "ns1", 1, "Sobre o tema: o modelo judicare remunera dativos.", S1),
      p("n2", "ns1", 2, "O modelo judicare paga advogados particulares e outros.", S1),
    ] };
    const result = one(anchor, next);
    expect(result.status).toBe("active");
    if (result.status === "active") expect(result.anchor.start).toEqual({ paragraphId: "n2", offset: 2 });
    const tied: VersionText = { paragraphs: [p("n1", "ns1", 1, "X modelo judicare Y", S1), p("n2", "ns1", 2, "X modelo judicare Y", S1)] };
    const tiedAnchor: Anchor = { ...anchor, prefix: "zzz", suffix: "www" };
    expect(reanchor([{ id: "g", anchor: tiedAnchor }], oldDoc, tied)[0].status).toBe("orphaned");
  });

  it("trecho removido fica órfão", () => {
    const anchor = anchorOf(["o2", 2], ["o2", 17]);
    expect(one(anchor, { paragraphs: [p("n1", "ns1", 1, "Conteúdo totalmente diferente.", S1)] }).status).toBe("orphaned");
  });

  it("aspas curvas na nova versão ainda casam com o trecho salvo", () => {
    const old: VersionText = { paragraphs: [p("o1", "os1", 1, 'O chamado "modelo misto" combina os dois.', S1)] };
    const anchor = createAnchor(old, { paragraphId: "o1", offset: 10 }, { paragraphId: "o1", offset: 24 });
    const next: VersionText = { paragraphs: [p("n1", "ns1", 1, "Em resumo, o chamado “modelo misto” combina os dois.", S1)] };
    const result = reanchor([{ id: "g", anchor }], old, next)[0];
    expect(result.status).toBe("active");
    if (result.status === "active") expect(quoteAt(next, result.anchor)).toBe("“modelo misto”");
  });

  it("trecho em dois parágrafos editados reancora com início e fim em parágrafos distintos", () => {
    const anchor = anchorOf(["o1", 70], ["o2", 15]);
    const next: VersionText = { paragraphs: [p("n1", "ns1", 1, "O modelo público usa servidores com remuneração fixa.", S1), p("n2", "ns1", 2, "O modelo judicare paga advogados.", S1)] };
    const result = one(anchor, next);
    expect(result.status).toBe("active");
    if (result.status === "active") { expect(result.anchor.start.paragraphId).toBe("n1"); expect(result.anchor.end).toEqual({ paragraphId: "n2", offset: 15 }); }
  });
});
