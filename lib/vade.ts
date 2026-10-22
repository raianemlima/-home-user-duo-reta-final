// Vade Esperto: a letra da lei selecionada pelo DUO, um PDF por matéria, que o cronograma manda ler todo dia.
// Os PDFs ficam no bucket privado "vade-esperto" (<slug>.pdf); a equipe envia em Equipe › Vade Esperto.
export const VADE_BUCKET = "vade-esperto";
export const MAX_VADE_BYTES = 25 * 1024 * 1024;

export type VadeMaterial = { slug: string; titulo: string; pattern: RegExp };
// A ordem importa: "processo penal" e "execução penal" são achados antes de "penal"; "processo civil", antes de "civil".
export const VADE_MATERIALS: VadeMaterial[] = [
  { slug: "constituicao", titulo: "Constituição Federal", pattern: /constituciona|constituicao|\bcf\b/ },
  { slug: "direitos-humanos", titulo: "Direitos Humanos", pattern: /humanos|\bdh\b/ },
  { slug: "administrativo", titulo: "Direito Administrativo", pattern: /administrativ|\badm\b/ },
  { slug: "processo-penal", titulo: "Código de Processo Penal", pattern: /process\w* penal|\bcpp\b/ },
  { slug: "execucao-penal", titulo: "Lei de Execução Penal", pattern: /execu\w* penal|\blep\b/ },
  { slug: "legislacao-penal", titulo: "Legislação Penal Especial", pattern: /legisla\w* penal|penal especial/ },
  { slug: "penal", titulo: "Código Penal", pattern: /\bpenal\b|\bcp\b/ },
  { slug: "processo-civil", titulo: "Código de Processo Civil", pattern: /process\w* civil|\bcpc\b/ },
  { slug: "civil", titulo: "Código Civil", pattern: /\bcivil\b/ },
  { slug: "eca", titulo: "Estatuto da Criança e do Adolescente", pattern: /crianca|adolescen|\beca\b/ },
  { slug: "consumidor", titulo: "Código de Defesa do Consumidor", pattern: /consumidor|\bcdc\b/ },
  { slug: "difusos", titulo: "Direitos Difusos e Coletivos", pattern: /difusos|coletivos/ },
];
export const vadeMaterial = (slug: string) => VADE_MATERIALS.find((material) => material.slug === slug) ?? null;

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Os Vade Espertos que uma atividade do cronograma cita ("Vade Esperto – Consumidor e Difusos" → consumidor e difusos).
export function vadeFor(title: string): string[] {
  let text = fold(title).replace(/vade\s*esperto/g, " ");
  const found: string[] = [];
  for (const material of VADE_MATERIALS) {
    if (!material.pattern.test(text)) continue;
    found.push(material.slug);
    text = text.replace(new RegExp(material.pattern.source, "g"), " ");
  }
  return found;
}
