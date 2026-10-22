import Link from "next/link";
import { AppTips } from "@/components/AppTips";
import { listDisciplines } from "@/lib/reader/queries";
import { studentSession } from "@/lib/reader/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { supabase, userId } = await studentSession();
  const disciplines = await listDisciplines(supabase, userId);
  const fresh = disciplines.filter((discipline) => discipline.updatedSinceLastVisit);
  return <div className="home">
    <p className="eyebrow">Reta Final DPE-SP</p>
    <h1>Disciplinas</h1>
    {fresh.length > 0 && <p className="new-banner" role="status">🆕 Material novo: {fresh.map((discipline, index) => <span key={discipline.id}>{index > 0 && ", "}<Link href={`/disciplinas/${discipline.slug}`}>{discipline.title}</Link></span>)}. O PDF original está disponível dentro da disciplina.</p>}
    <AppTips />
    {!disciplines.length && <p className="empty">O material ainda está sendo publicado. Volte em breve.</p>}
    <ul className="discipline-grid">{disciplines.map((discipline) => <li key={discipline.id}>
      <Link className="discipline-card" href={`/disciplinas/${discipline.slug}`}>
        <span className="discipline-title">{discipline.title}</span>
        <span className="discipline-meta">{discipline.versionLabel}{discipline.updatedSinceLastVisit && <span className="badge">Atualizado</span>}</span>
        <span className="discipline-action">{discipline.lastSectionId ? "Continuar de onde parei →" : "Começar a ler →"}</span>
      </Link>
    </li>)}</ul>
  </div>;
}
