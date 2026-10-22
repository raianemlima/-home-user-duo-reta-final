import type { HighlightColor } from "@/lib/highlights/types";
import type { NotebookGroup } from "@/lib/notebook/queries";

// Modelo neutro de documento: o PDF (V1) e o DOCX (V2) são só renderizadores dele.
export type ExportItem = { quote: string; note: string | null; color: HighlightColor; reviewed: boolean; orphanedNotice: string | null; reference: string };
export type ExportDoc = { title: string; subtitle: string; footer: string; generatedAt: string; disciplines: { title: string; topics: { heading: string; items: ExportItem[] }[] }[] };

export const MAX_EXPORT_ITEMS = 3000;
const ORPHAN = "Trechos alterados na atualização";
const date = (value: Date, options: Intl.DateTimeFormatOptions) => value.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", ...options });

export const countItems = (notebook: NotebookGroup[]) => notebook.reduce((sum, group) => sum + group.topics.reduce((count, topic) => count + topic.items.length, 0), 0);

export function buildNotebookExport(notebook: NotebookGroup[], ownerEmail: string, now: Date): ExportDoc {
  return {
    title: "Caderno de revisão",
    subtitle: "Reta Final DPE-SP",
    footer: `Cursos DUO · Reta Final DPE-SP · uso pessoal de ${ownerEmail}`,
    generatedAt: date(now, { day: "2-digit", month: "2-digit", year: "numeric" }),
    disciplines: notebook.map((group) => ({
      title: group.discipline.title,
      topics: group.topics.map((topic) => ({
        heading: topic.path.join(" › "),
        items: topic.items.map((item) => ({
          quote: item.quote, note: item.note, color: item.color, reviewed: item.reviewed,
          orphanedNotice: item.orphaned ? `Este trecho mudou na atualização${item.orphanedAt ? ` de ${date(new Date(item.orphanedAt), { day: "2-digit", month: "2-digit" })}` : ""}.` : null,
          reference: item.orphaned || topic.path[0] === ORPHAN ? group.discipline.title : [group.discipline.title, ...topic.path].join(" › "),
        })),
      })),
    })),
  };
}
