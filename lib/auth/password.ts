export const MIN_PASSWORD_LENGTH = 8;

// Regras da nova senha. `defaultPassword` é a senha padrão dos alunos: não pode ser reaproveitada.
export function validateNewPassword(password: unknown, defaultPassword: string | undefined): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) return `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password.length > 72) return "Use no máximo 72 caracteres.";
  if (defaultPassword && password === defaultPassword) return "Escolha uma senha diferente da senha inicial.";
  if (/^(.)\1+$/.test(password)) return "Escolha uma senha menos previsível.";
  return null;
}
