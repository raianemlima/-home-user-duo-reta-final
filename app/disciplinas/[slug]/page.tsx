import { notFound, redirect } from "next/navigation";
import { firstSectionId, listDisciplines } from "@/lib/reader/queries";
import { studentSession } from "@/lib/reader/session";

export const dynamic = "force-dynamic";

// Abre a última seção lida (se ainda existir na versão publicada) ou a primeira.
export default async function DisciplinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, userId } = await studentSession();
  const card = (await listDisciplines(supabase, userId)).find((discipline) => discipline.slug === slug);
  const target = card?.lastSectionId ?? (card ? await firstSectionId(supabase, slug) : null);
  if (!target) notFound();
  redirect(`/disciplinas/${slug}/${target}`);
}
