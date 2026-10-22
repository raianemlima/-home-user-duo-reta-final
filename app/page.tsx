import Link from "next/link";
import { listDisciplines } from "@/lib/reader/queries";
import { studentSession } from "@/lib/reader/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { supabase, userId } = await studentSession();
  const disciplines = await listDisciplines(supabase, userId);
  return <div className="home">
    <p className="eyebrow">Reta Final DPE-SP</p>
    <h1>Disciplinas</h1>
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
