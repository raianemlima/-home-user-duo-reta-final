export type Letter = "A" | "B" | "C" | "D" | "E";
// Uma questão do banco, já normalizada pelo importador (scripts/questoes/importar.mjs).
export type Question = {
  id: string; concurso: string; orgao: string; ano: number | null; banca: string; cargo: string;
  disciplina: string; materia: string; assunto: string | null;
  enunciado: string; alternativas: Partial<Record<Letter, string>>; gabarito: Letter | null; anulada: boolean;
  // Gabarito comentado, quando a fonte traz (texto original, sem edição).
  comentario?: string | null;
};
