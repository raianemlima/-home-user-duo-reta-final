import Image from "next/image";
import Link from "next/link";
import { AppTips } from "@/components/AppTips";
import { StudyPlan } from "@/components/StudyPlan";
import { daysUntilExam, EXAM_LABEL, examCountdown } from "@/lib/exam";
import { lastRead, listDisciplines } from "@/lib/reader/queries";
import { studentSession } from "@/lib/reader/session";
import { isVadeDiscipline } from "@/lib/vade";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { supabase, userId } = await studentSession();
  // Os Vade Espertos publicados no leitor ficam na página Vade Esperto, não na lista de ebooks.
  const disciplines = (await listDisciplines(supabase, userId)).filter((discipline) => !isVadeDiscipline(discipline.slug));
  const fresh = disciplines.filter((discipline) => discipline.updatedSinceLastVisit);
  // "Continuar" é a ação mais comum: a disciplina lida por último ganha destaque.
  const resume = lastRead(disciplines);
  const others = disciplines.filter((discipline) => discipline !== resume);
  const now = new Date(), days = daysUntilExam(now);
  return <div className="home">
    <header className="grid-paper"><p className="eyebrow">Reta Final DPE-SP</p><h1>Disciplinas</h1></header>
    <section className="exam-card" aria-label="Data da prova">
      {days > 1 && <span className="exam-days">{days}</span>}
      <div><p><strong>{days > 1 ? "dias para a prova da DPE-SP" : examCountdown(now)}</strong></p><p className="muted">Prova: domingo, {EXAM_LABEL}</p></div>
    </section>
    {fresh.length > 0 && <p className="new-banner" role="status">🆕 Material novo: {fresh.map((discipline, index) => <span key={discipline.id}>{index > 0 && ", "}<Link href={`/disciplinas/${discipline.slug}`}>{discipline.title}</Link></span>)}. O PDF original está disponível dentro da disciplina.</p>}
    {!disciplines.length && <p className="empty">O material ainda está sendo publicado. Volte em breve.</p>}
    {resume && <Link className="resume-card" href={`/disciplinas/${resume.slug}`}>
      <span className="eyebrow">Continuar de onde parei</span>
      <span className="resume-title">{resume.title}</span>
      <span className="resume-meta">{resume.versionLabel}{resume.updatedSinceLastVisit ? " · Atualizado" : ""}</span>
      <span className="resume-action">Continuar a leitura →</span>
    </Link>}
    {others.length > 0 && <>
      <h2 className="section-title">{resume ? "Outras disciplinas" : "Todas as disciplinas"}</h2>
      <ul className="discipline-grid">{others.map((discipline) => <li key={discipline.id}>
        <Link className="discipline-card" href={`/disciplinas/${discipline.slug}`}>
          <span className="discipline-head"><span className="disc-dot"><Image src="/brand/pena-branca.png" width={26} height={26} alt="" /></span><span className="discipline-title">{discipline.title}</span></span>
          <span className="discipline-meta">{discipline.versionLabel}{discipline.updatedSinceLastVisit && <span className="badge">Atualizado</span>}</span>
          <span className="discipline-action">Começar a ler →</span>
        </Link>
      </li>)}</ul>
    </>}
    <StudyPlan />
    <AppTips />
  </div>;
}
