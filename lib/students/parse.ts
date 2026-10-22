export type ParsedStudentList = { valid: { email: string; name: string }[]; invalid: string[]; duplicates: string[] };

export const MAX_STUDENTS_PER_BATCH = 500;
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

// Lista colada pela equipe: um aluno por linha, vírgula, ponto e vírgula ou tab; aceita "email" e "Nome <email>".
export function parseStudentList(raw: string): ParsedStudentList {
  const result: ParsedStudentList = { valid: [], invalid: [], duplicates: [] };
  const seen = new Set<string>();
  for (const token of raw.split(/[\n\r,;\t]+/).map((part) => part.trim()).filter(Boolean)) {
    const named = /^(.*?)\s*<([^<>]+)>$/.exec(token);
    const email = (named ? named[2] : token).trim().toLowerCase();
    if (!EMAIL.test(email)) { result.invalid.push(token); continue; }
    if (seen.has(email)) { if (!result.duplicates.includes(email)) result.duplicates.push(email); continue; }
    seen.add(email);
    result.valid.push({ email, name: named ? named[1].trim().replace(/^["']|["']$/g, "") : "" });
  }
  return result;
}
