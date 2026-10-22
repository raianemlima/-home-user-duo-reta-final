// Mensagem única para o envio do link: não revela se o e-mail é de aluno.
export const LOGIN_SENT_MESSAGE = "Se este e-mail estiver cadastrado no curso, você receberá um link e um código de acesso.";

export function loginMessage(error: { message: string } | null): string {
  void error;
  return LOGIN_SENT_MESSAGE;
}

export const LOGIN_REASONS: Record<string, string> = {
  "sem-acesso": "Seu acesso ao curso não está ativo. Fale com a equipe do Cursos DUO.",
  "link-expirado": "O link de acesso expirou ou já foi usado. Peça um novo abaixo.",
};
