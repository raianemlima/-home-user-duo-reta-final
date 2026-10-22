import { describe, expect, it } from "vitest";
import { QUESTIONS } from "@/lib/questions/data";
import { bankDisciplinesFor, questionBankHref } from "@/lib/questions/day-link";
import { parseQuestionFilter, searchQuestions } from "@/lib/questions/bank";

describe("atividade do cronograma → banco de questões", () => {
  it("acha a disciplina do banco pelo título da atividade", () => {
    expect(bankDisciplinesFor("Trilha de Processo Penal")).toEqual(["Direito Processual Penal"]);
    expect(bankDisciplinesFor("Vade Esperto – Legislação Penal Especial")).toEqual(["Direito Penal"]);
    expect(bankDisciplinesFor("Vade Esperto – Consumidor e Difusos")).toEqual(["Direito do Consumidor", "Direitos Difusos e Coletivos"]);
    expect(bankDisciplinesFor("Trilha de Direito Civil e Empresarial")).toEqual(["Direito Civil"]);
    expect(bankDisciplinesFor("Trilha de Produção Institucional da Defensoria de São Paulo")).toEqual(["Princípios Institucionais da Defensoria"]);
    expect(bankDisciplinesFor("Mini Curso de Humanística")).toEqual(["Filosofia e Sociologia do Direito"]);
    expect(bankDisciplinesFor("Revisão das aulas ao vivo")).toEqual([]);
  });
  it("todas as disciplinas que o cronograma pode apontar existem no banco", () => {
    const bank = new Set(QUESTIONS.map((question) => question.disciplina));
    for (const title of ["processo penal", "processo civil", "execução penal", "criminologia", "penal", "constitucional", "administrativo", "criança", "consumidor", "difusos", "direitos humanos", "institucional", "humanística", "internacional", "civil"]) {
      for (const discipline of bankDisciplinesFor(title)) expect(bank.has(discipline), discipline).toBe(true);
    }
  });
  it("o link junta as disciplinas do dia e o banco filtra por todas elas", () => {
    const href = questionBankHref(["Direito Penal", "Execução Penal"]);
    const filter = parseQuestionFilter(new URL(href, "http://x").searchParams);
    const result = searchQuestions(QUESTIONS, { ...filter, situacao: "todas" }, new Map());
    expect(result.total).toBe(QUESTIONS.filter((question) => ["Direito Penal", "Execução Penal"].includes(question.disciplina)).length);
    expect(filter.situacao).toBe("nao-respondidas");
  });
});
