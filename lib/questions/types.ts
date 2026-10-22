export type Letter = "A" | "B" | "C" | "D" | "E";
// Uma questão do banco, já normalizada pelo importador (scripts/questoes/importar.mjs).
export type Question = {
  id: string; concurso: string; orgao: string; ano: number | null; banca: string; cargo: string;
  disciplina: string; materia: string; assunto: string | null;
  enunciado: string; alternativas: Partial<Record<Letter, string>>; gabarito: Letter | null; anulada: boolean;
  // Gabarito comentado, quando a fonte traz (texto original, sem edição).
  comentario?: string | null;
};

// UM apoio do gabarito. Dois tipos, e a tela diz qual é qual para o aluno não confundir lei seca com resumo:
//  - "lei": `texto` é a transcrição literal do dispositivo e `url` é a página oficial de onde veio;
//  - "entendimento": `texto` resume a posição do tribunal ou do órgão (não é citação), e `url` só entra se oficial.
export type Dispositivo = {
  // Como se cita: "CF/1988, art. 5º, LXXIV", "LEP, art. 81-B, V", "STJ, 6ª Turma, AgRg no HC 731.257/MG".
  ref: string;
  tipo: "lei" | "entendimento";
  texto: string;
  url?: string;
};

// Fundamentação do gabarito de uma questão, conferida nas fontes.
// `dispositivos` vazio é o caso da questão sem fundamentação possível (norma interna de outra Defensoria,
// constituição estadual, história, interpretação de texto): aí só vai a `ressalva`, dizendo o porquê.
export type Fundamentacao = {
  // Uma ou duas frases ligando a fundamentação à alternativa correta.
  nota: string;
  dispositivos: Dispositivo[];
  // Data da conferência nas fontes (ISO, AAAA-MM-DD).
  conferido: string;
  // Entra quando a conferência não fecha: gabarito discutível, questão anulada, lei nova depois da prova,
  // ou tese que só se sustenta em doutrina. O aluno vê o aviso em destaque.
  ressalva?: string;
};
