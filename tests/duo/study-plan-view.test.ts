import { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { describe, expect, it } from "vitest";
import { activitiesOf, dropToc, splitByWeekday, studyPlanFromDocx, weekdayOf } from "@/lib/study-plan-view";

const docx = (children: Paragraph[]) => Packer.toBuffer(new Document({ sections: [{ children }] }));

describe("cronograma lido no app", () => {
  it("reconhece o título de cada dia da semana, com ou sem hífen e acento", () => {
    expect(["SEGUNDA FEIRA", "Terça-feira", "QUARTA-FEIRA", "quinta", "SÁBADO", "Domingo", "DOMINGO· SIMULADO"].map(weekdayOf)).toEqual([1, 2, 3, 4, 6, 0, 0]);
    expect(weekdayOf("Segunda-feira: 2h de trilha")).toBeNull();
  });
  it("separa as orientações gerais e um trecho por dia", () => {
    const view = splitByWeekday("<h1>Método</h1><p>Leia antes</p><p>SEGUNDA FEIRA</p><p>Questões</p><h2>TERÇA-FEIRA</h2><p>Vade</p>");
    expect(view.geral).toBe("<h1>Método</h1><p>Leia antes</p>");
    expect(view.dias).toEqual([{ dia: 1, titulo: "SEGUNDA FEIRA", html: "<p>Questões</p>" }, { dia: 2, titulo: "TERÇA-FEIRA", html: "<p>Vade</p>" }]);
    expect(view.anexos).toEqual([]);
  });
  it("depois dos dias, cada título abre um anexo (as trilhas por disciplina)", () => {
    const view = splitByWeekday("<p>SEXTA-FEIRA</p><p>Trilha de Penal</p><h1>TRILHAS INTELIGENTES</h1><p>No seu ritmo</p><h2>DIREITO PENAL</h2><p>Passo 1</p><h2></h2><h2>DIREITO CIVIL</h2><p>Passo 1</p>");
    expect(view.dias.map((day) => day.html)).toEqual(["<p>Trilha de Penal</p>"]);
    expect(view.anexos).toEqual([{ titulo: "TRILHAS INTELIGENTES", html: "<p>No seu ritmo</p>" }, { titulo: "DIREITO PENAL", html: "<p>Passo 1</p>" }, { titulo: "DIREITO CIVIL", html: "<p>Passo 1</p>" }]);
  });
  it("converte o Word mantendo os links (abrindo fora do app) e descartando link perigoso", async () => {
    const buffer = await docx([
      new Paragraph({ text: "Cronograma", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: "QUINTA-FEIRA" }),
      new Paragraph({ children: [new TextRun("Súmulas: "), new ExternalHyperlink({ link: "https://buscadordizerodireito.com.br/sumulas", children: [new TextRun("link do dia")] })] }),
      new Paragraph({ children: [new ExternalHyperlink({ link: "javascript:alert(1)", children: [new TextRun("não clique")] })] }),
    ]);
    const view = await studyPlanFromDocx(buffer);
    expect(view.geral).toContain("Cronograma");
    expect(view.dias).toHaveLength(1);
    expect(view.dias[0].dia).toBe(4);
    expect(view.dias[0].html).toContain('<a href="https://buscadordizerodireito.com.br/sumulas" target="_blank" rel="noopener noreferrer">link do dia</a>');
    expect(view.dias[0].html).not.toContain("javascript");
  });
  it("lista as atividades do dia com o tempo e os links de cada uma", () => {
    const html = '<table><tr><td><p>ATIVIDADE 1</p><p>Questões do dia</p></td><td><p>TEMPO</p><p>1h</p></td></tr></table><p>Link: <a href="https://www.qconcursos.com/q?x=1">https://www.qconcursos.com/q?x=1</a></p>'
      + '<table><tr><td>ATIVIDADE 2 Súmulas do dia</td><td>TEMPO 10min</td></tr></table><p><a href="https://a.com/1">Súmulas →</a> <a href="https://a.com/2">https://a.com/2</a> <a href="https://a.com/3">https://a.com/3</a></p>';
    expect(activitiesOf(html)).toEqual([
      { titulo: "Questões do dia", tempo: "1h", links: [{ href: "https://www.qconcursos.com/q?x=1", rotulo: "qconcursos.com" }] },
      { titulo: "Súmulas do dia", tempo: "10min", links: [{ href: "https://a.com/1", rotulo: "Súmulas" }, { href: "https://a.com/2", rotulo: "a.com" }, { href: "https://a.com/3", rotulo: "a.com (2)" }] },
    ]);
  });
  it("ignora o sumário do Word (linhas só com link interno), que repetiria os dias", () => {
    const html = '<p><strong>SUMÁRIO </strong></p><p><a href="#_Toc1">SEGUNDA FEIRA\t6</a></p><p><a href="#_Toc2">DOMINGO· SIMULADO\t19</a></p><p>Veja <a href="#_Toc3">aqui</a> as regras.</p><h2>SEGUNDA FEIRA</h2><p>Questões</p>';
    const clean = dropToc(html);
    expect(clean).not.toContain("SUMÁRIO");
    expect(clean).not.toContain("SIMULADO");
    expect(clean).toContain("Veja");
    expect(splitByWeekday(clean).dias.map((day) => day.dia)).toEqual([1]);
  });
});
