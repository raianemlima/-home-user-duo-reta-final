import { studentSession } from "@/lib/reader/session";
import { listVade } from "@/lib/server/vade";

export const dynamic = "force-dynamic";

// Vade Esperto: a letra da lei de cada matéria, para ler no tempo que o cronograma indica (abre o PDF numa aba nova).
export default async function VadeEspertoPage() {
  const { supabase } = await studentSession();
  const materials = (await listVade(supabase)).filter((material) => material.disponivel);
  return <div>
    <header className="grid-paper"><p className="eyebrow">Reta Final DPE-SP</p><h1>Vade Esperto</h1></header>
    <p className="muted">A letra da lei mais cobrada de cada matéria. Leia no tempo que o cronograma indica, anote onde parou e continue na semana seguinte; terminou, volte ao início.</p>
    {!materials.length && <p className="empty">Os Vade Espertos ainda estão sendo publicados. Volte em breve.</p>}
    <ul className="discipline-grid">{materials.map((material) => <li key={material.slug} id={material.slug} className="discipline-card">
      <span className="discipline-title">{material.titulo}</span>
      <span className="discipline-meta">{material.versao || "Vade Esperto DUO"}</span>
      <span className="sheet-actions"><a className="button primary" href={`/api/vade-esperto/${material.slug}`} target="_blank" rel="noopener">Abrir</a><a className="button" href={`/api/vade-esperto/${material.slug}?baixar=1`}>Baixar PDF</a></span>
    </li>)}</ul>
  </div>;
}
