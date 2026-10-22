// Mensagem única para qualquer falha de login: não revela se o e-mail é de aluno.
export const LOGIN_FAILED_MESSAGE = "E-mail ou senha incorretos. Use o e-mail da sua matrícula.";

export const LOGIN_REASONS: Record<string, string> = {
  "sem-acesso": "Seu acesso ao curso não está ativo. Fale com a equipe do Cursos DUO.",
  "link-expirado": "O link de acesso expirou ou já foi usado. Entre com e-mail e senha.",
};
