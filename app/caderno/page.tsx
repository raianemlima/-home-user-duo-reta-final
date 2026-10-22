import { NotebookView } from "@/components/notebook/NotebookView";
import { parseNotebookFilter } from "@/lib/notebook/filters";
import { loadNotebook } from "@/lib/notebook/queries";
import { listDisciplines } from "@/lib/reader/queries";
import { studentSession } from "@/lib/reader/session";

export const dynamic = "force-dynamic";

export default async function NotebookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params = new URLSearchParams(Object.entries(raw).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])));
  const filter = parseNotebookFilter(params);
  const { supabase, userId } = await studentSession();
  const [groups, disciplines] = await Promise.all([loadNotebook(supabase, userId, filter), listDisciplines(supabase, userId)]);
  return <NotebookView groups={groups} filter={filter} disciplines={disciplines.map(({ slug, title }) => ({ slug, title }))} />;
}
