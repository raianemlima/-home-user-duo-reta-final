import { describe, expect, it } from "vitest";
import { isVadeDiscipline, vadeFor, vadeMaterial, VADE_MATERIALS, vadeOfDiscipline } from "@/lib/vade";

describe("Vade Esperto citado no cronograma", () => {
  it("acha o PDF certo pelo título da atividade", () => {
    expect(vadeFor("Vade Esperto - Direitos Humanos")).toEqual(["direitos-humanos"]);
    expect(vadeFor("Vade Esperto – Direito Administrativo")).toEqual(["administrativo"]);
    expect(vadeFor("Vade Esperto - Direito Penal")).toEqual(["penal"]);
    expect(vadeFor("Vade Esperto – Legislação Penal Especial")).toEqual(["legislacao-penal"]);
    expect(vadeFor("Vade Esperto – Processo Penal")).toEqual(["processo-penal"]);
    expect(vadeFor("Vade Esperto – Execução Penal")).toEqual(["execucao-penal"]);
    expect(vadeFor("Vade Esperto – Direito Civil")).toEqual(["civil"]);
    expect(vadeFor("Vade Esperto – Processo Civil")).toEqual(["processo-civil"]);
    expect(vadeFor("Vade Esperto – Direito da Criança e do Adolescente")).toEqual(["eca"]);
    expect(vadeFor("Vade Esperto – Constitucional")).toEqual(["constituicao"]);
    expect(vadeFor("Vade Esperto – Consumidor e Difusos")).toEqual(["consumidor", "difusos"]);
  });
  it("cada matéria tem slug válido para o armazenamento e título", () => {
    for (const material of VADE_MATERIALS) expect(material.slug).toMatch(/^[a-z0-9-]{2,40}$/);
    expect(vadeMaterial("cpp")).toBeNull();
    expect(vadeMaterial("processo-penal")?.titulo).toBe("Código de Processo Penal");
  });
  it("disciplina do leitor chamada Vade Esperto – <matéria> vira o Vade Esperto daquela matéria", () => {
    expect(["Vade Esperto – CPP", "Vade Esperto – CP", "Vade Esperto - LEP", "Vade Esperto – Legislação Penal Especial", "Vade Esperto – CF", "Vade Esperto – DH", "Vade Esperto – ADM", "Vade Esperto – CDC", "Vade Esperto – Difusos e Coletivos", "Vade Esperto – ECA", "Vade Esperto – Código Civil", "Vade Esperto – Processo Civil"].map(vadeOfDiscipline))
      .toEqual(["processo-penal", "penal", "execucao-penal", "legislacao-penal", "constituicao", "direitos-humanos", "administrativo", "consumidor", "difusos", "eca", "civil", "processo-civil"]);
    expect(isVadeDiscipline("vade-esperto-cpp")).toBe(true);
    expect(isVadeDiscipline("direito-penal")).toBe(false);
  });
  it("os títulos das 12 disciplinas criadas no leitor apontam para a matéria certa", () => {
    const titles = ["Constituição Federal", "Direitos Humanos", "Direito Administrativo", "Código Penal", "Legislação Penal Especial", "Código de Processo Penal", "Lei de Execução Penal", "Código Civil", "Código de Processo Civil", "Estatuto da Criança e do Adolescente", "Código de Defesa do Consumidor", "Direitos Difusos e Coletivos"];
    expect(titles.map((title) => vadeOfDiscipline(`Vade Esperto – ${title}`))).toEqual(["constituicao", "direitos-humanos", "administrativo", "penal", "legislacao-penal", "processo-penal", "execucao-penal", "civil", "processo-civil", "eca", "consumidor", "difusos"]);
  });
});
