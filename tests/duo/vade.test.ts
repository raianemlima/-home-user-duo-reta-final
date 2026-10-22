import { describe, expect, it } from "vitest";
import { vadeFor, vadeMaterial, VADE_MATERIALS } from "@/lib/vade";

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
});
