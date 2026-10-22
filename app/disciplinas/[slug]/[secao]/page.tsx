import { notFound } from "next/navigation";
import { SectionView } from "@/components/reader/SectionView";
import { loadSection } from "@/lib/reader/queries";
import { studentSession } from "@/lib/reader/session";
import { UUID_PATTERN } from "@/lib/server/documents";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params }: { params: Promise<{ slug: string; secao: string }> }) {
  const { slug, secao } = await params;
  if (!UUID_PATTERN.test(secao)) notFound();
  const { supabase } = await studentSession();
  const view = await loadSection(supabase, slug, secao);
  if (!view) notFound();
  return <SectionView view={view} />;
}
