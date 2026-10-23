// Cronograma de estudos do aluno: um arquivo por aluno, no bucket privado "cronogramas", na pasta com o id do aluno.
export const STUDY_PLAN_BUCKET = "cronogramas";
export const MAX_STUDY_PLAN_BYTES = 10 * 1024 * 1024;
export const STUDY_PLAN_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};
export const STUDY_PLAN_ACCEPT = Object.keys(STUDY_PLAN_TYPES).map((extension) => `.${extension}`).join(",");

// Nome seguro para o armazenamento: sem acentos, barras ou espaços; mantém a extensão conferida.
export function studyPlanPath(userId: string, fileName: unknown, size: unknown): { path: string; contentType: string } | { error: string } {
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 180) return { error: "Nome de arquivo inválido." };
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const contentType = STUDY_PLAN_TYPES[extension];
  if (!contentType) return { error: "Envie o cronograma em PDF, imagem (PNG, JPG, WEBP), Word, Excel ou CSV." };
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return { error: "O arquivo está vazio." };
  if (size > MAX_STUDY_PLAN_BYTES) return { error: "O arquivo passa de 10 MB. Envie uma versão menor." };
  const base = fileName.slice(0, fileName.length - extension.length - 1).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "cronograma";
  return { path: `${userId}/${base}.${extension}`, contentType };
}

// Cronogramas oficiais do DUO, enviados pela equipe (Equipe › Cronogramas) e lidos dentro do app.
export type OfficialPlan = "3h" | "4h" | "6h";
export type PlanChoice = OfficialPlan | "proprio";
export const OFFICIAL_PLANS: Record<OfficialPlan, { path: string; label: string }> = {
  "3h": { path: "oficiais/3h.docx", label: "Cronograma DUO · 3 horas por dia" },
  "4h": { path: "oficiais/4h.docx", label: "Cronograma DUO · 4 horas por dia" },
  "6h": { path: "oficiais/6h.docx", label: "Cronograma DUO · 6 horas por dia" },
};
export const isOfficialPlan = (value: unknown): value is OfficialPlan => typeof value === "string" && Object.hasOwn(OFFICIAL_PLANS, value);
export const isPlanChoice = (value: unknown): value is PlanChoice => isOfficialPlan(value) || value === "proprio";
export const WEEKDAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
