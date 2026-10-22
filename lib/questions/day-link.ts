// Liga as atividades do cronograma ("Trilha de Processo Penal", "Vade Esperto – Consumidor e Difusos") às
// disciplinas do banco de questões, para o aluno ir direto às questões do que estuda no dia.
const RULES: [RegExp, string][] = [
  [/process\w* penal/, "Direito Processual Penal"], [/process\w* civil/, "Direito Processual Civil"],
  [/execu\w* penal/, "Execução Penal"], [/criminolog/, "Criminologia"],
  [/legisla\w* penal|penal especial|\bpenal\b/, "Direito Penal"],
  [/constituciona/, "Direito Constitucional"], [/administrativ|tribut|financeir/, "Direito Administrativo, Financeiro e Tributário"],
  [/crianca|adolescen/, "Direito da Criança e do Adolescente"], [/consumidor/, "Direito do Consumidor"],
  [/difusos|coletivos/, "Direitos Difusos e Coletivos"], [/direitos humanos|\bhumanos\b/, "Direitos Humanos"],
  [/institucion|defensoria|\bdpe\b/, "Princípios Institucionais da Defensoria"],
  [/humanistic|filosofia|sociologia/, "Filosofia e Sociologia do Direito"], [/internaciona/, "Direito Internacional"],
  [/\bcivil\b/, "Direito Civil"],
];
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Disciplinas do banco citadas no título de uma atividade (uma atividade pode juntar duas: "Consumidor e Difusos").
export function bankDisciplinesFor(title: string): string[] {
  let text = fold(title);
  const found: string[] = [];
  for (const [pattern, discipline] of RULES) {
    if (!pattern.test(text)) continue;
    if (!found.includes(discipline)) found.push(discipline);
    text = text.replace(new RegExp(pattern.source, "g"), " "); // "processo penal" não conta de novo como "penal"
  }
  return found;
}

// Link para o banco de questões já filtrado pelas disciplinas, começando pelas que o aluno ainda não respondeu.
export const questionBankHref = (disciplines: string[]) => `/questoes?${new URLSearchParams({ disciplina: disciplines.join("|"), situacao: "nao-respondidas" }).toString()}`;
