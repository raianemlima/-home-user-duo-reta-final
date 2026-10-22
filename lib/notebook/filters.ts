import { isHighlightColor, type HighlightColor } from "@/lib/highlights/types";
import type { NotebookFilter } from "@/lib/notebook/queries";

// Filtros na URL (?disciplinas=a,b&cores=x,y&revisados=pending): os mesmos valem para a tela e para a exportação.
export function parseNotebookFilter(params: URLSearchParams): NotebookFilter {
  const list = (key: string) => (params.get(key) ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const reviewed = params.get("revisados");
  return { disciplines: list("disciplinas"), colors: list("cores").filter(isHighlightColor) as HighlightColor[], reviewed: reviewed === "pending" || reviewed === "done" ? reviewed : "all" };
}

export function notebookQuery(filter: NotebookFilter): string {
  const params = new URLSearchParams();
  if (filter.disciplines?.length) params.set("disciplinas", filter.disciplines.join(","));
  if (filter.colors?.length) params.set("cores", filter.colors.join(","));
  if (filter.reviewed && filter.reviewed !== "all") params.set("revisados", filter.reviewed);
  return params.toString();
}
