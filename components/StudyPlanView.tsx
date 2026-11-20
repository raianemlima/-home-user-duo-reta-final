"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bankDisciplinesFor, questionBankHref } from "@/lib/questions/day-link";
import { WEEKDAY_NAMES } from "@/lib/study-plan";
import { activityKeys, weekDates } from "@/lib/study-progress";
import { vadeFor, vadeMaterial } from "@/lib/vade";

type Activity = { titulo: string; tempo: string; links: { href: string; rotulo: string }[] };
type Day = { dia: number; titulo: string; html: string; atividades?: Activity[] };
type Annex = { titulo: string; html: string };
type Content = { plano: string; titulo: string; tipo: "docx"; geral: string; dias: Day[]; anexos: Annex[]; vade?: string[]; vadeLeitor?: Record<string, string> } | { plano: string; titulo: string; tipo: "arquivo" };
// Semana de estudo começa na segunda.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
// "Defensoria de São Paulo" e "DPE/SP" são a mesma coisa para achar a trilha.
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")
  .replace(/\bdefensoria( publica)?\b/g, "dpe").replace(/\bsao paulo\b/g, "sp");
// Palavras que não identificam a disciplina; as demais viram radicais ("processo" e "processual" → "proces").
const FILLER = new Set(["direito", "direitos", "trilha", "de", "da", "do", "das", "dos", "e"]);
const stems = (text: string) => new Set(fold(text).split(" ").filter((word) => word.length > 2 && !FILLER.has(word)).map((word) => word.slice(0, 6)));
// A trilha que uma atividade cita ("Trilha de Processo Penal", "Processo Civil"): o anexo de título mais parecido,
// se parecer o bastante. Vade Esperto, súmulas, questões e temas ficam fora: são de outros materiais.
function annexFor(title: string, annexes: { titulo: string; index: number }[]) {
  if (/^(vade|s[uú]mulas|quest[oõ]es|temas)\b/i.test(title.trim())) return null;
  const wanted = stems(title);
  let best: { index: number; score: number } | null = null;
  for (const annex of annexes) {
    const have = stems(annex.titulo);
    const shared = [...wanted].filter((stem) => have.has(stem)).length;
    const score = shared / new Set([...wanted, ...have]).size;
    if (score >= 0.5 && (!best || score > best.score)) best = { index: annex.index, score };
  }
  return best?.index ?? null;
}

// O cronograma escolhido lido no app: abre no dia de hoje, com os links do documento clicáveis.
// O HTML vem do servidor já limpo (só formatação, tabelas e links http/https).
export function StudyPlanView() {
  const [content, setContent] = useState<Content | null>(null); const [error, setError] = useState("");
  const [day, setDay] = useState(() => new Date().getDay()); const [open, setOpen] = useState<number | null>(null);
  // Atividades concluídas nesta semana, por "data|atividade". null: a marcação não está disponível.
  const week = useMemo(() => weekDates(new Date()), []);
  const [done, setDone] = useState<Set<string> | null>(null); const [saving, setSaving] = useState<string | null>(null); const [progressError, setProgressError] = useState("");
  useEffect(() => {
    fetch(`/api/cronograma/progresso?de=${week[1]}&ate=${week[0]}`).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.disponivel) return;
      setDone(new Set((payload.feitas as { dia: string; atividade: string }[]).map((item) => `${item.dia}|${item.atividade}`)));
    }).catch(() => undefined);
  }, [week]);
  const toggle = useCallback(async (dia: string, atividade: string) => {
    const key = `${dia}|${atividade}`; const concluida = !done?.has(key);
    const apply = (on: boolean) => setDone((current) => { const next = new Set(current ?? []); if (on) next.add(key); else next.delete(key); return next; });
    apply(concluida); setSaving(key); setProgressError("");
    try {
      const response = await fetch("/api/cronograma/progresso", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ dia, atividade, concluida }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error?.message ?? "Não foi possível salvar.");
    } catch (failure) {
      apply(!concluida); setProgressError(failure instanceof Error ? failure.message : "Não foi possível salvar.");
    } finally { setSaving(null); }
  }, [done]);
  useEffect(() => {
    fetch("/api/cronograma/conteudo").then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? "Não foi possível abrir o cronograma.");
      setContent(payload);
    }).catch((failure: Error) => setError(failure.message));
  }, []);

  if (error) return <div className="plan-view"><p className="auth-error" role="alert">{error}</p><Link className="button" href="/">Escolher cronograma</Link></div>;
  if (!content) return <p className="muted">Carregando o cronograma…</p>;
  if (content.tipo === "arquivo") return <div className="plan-view">
    <h1>{content.titulo}</h1>
    <p className="muted">Este arquivo não é Word, então não dá para separar os dias aqui dentro. Abra o arquivo, ou envie o cronograma em .docx para ler no app.</p>
    <a className="button primary" href="/api/cronograma/arquivo" target="_blank" rel="noopener">Abrir meu cronograma</a>
  </div>;

  const days = ORDER.map((number) => content.dias.find((item) => item.dia === number)).filter((item): item is Day => Boolean(item));
  const current = content.dias.find((item) => item.dia === day);
  const isToday = day === new Date().getDay();
  const annexes = content.anexos.map((annex, index) => ({ ...annex, index }));
  const activities = current?.atividades ?? [];
  // Disciplinas do dia, tiradas das trilhas e do Vade Esperto, para o atalho do banco de questões do app.
  const isStudy = (title: string) => !/^(quest[oõ]es|s[uú]mulas|temas|revis)/i.test(fold(title).trim());
  const dayDisciplines = [...new Set(activities.filter((activity) => isStudy(activity.titulo)).flatMap((activity) => bankDisciplinesFor(activity.titulo)))];
  // Progresso: do dia aberto e da semana inteira (só dias com atividades separadas).
  const keysOf = (item: Day) => activityKeys((item.atividades ?? []).map((activity) => activity.titulo));
  const doneIn = (item: Day) => keysOf(item).filter((key) => done?.has(`${week[item.dia]}|${key}`)).length;
  const dayKeys = current ? keysOf(current) : [];
  const dayDone = current ? doneIn(current) : 0;
  const weekTotal = days.reduce((sum, item) => sum + (item.atividades?.length ?? 0), 0);
  const weekDone = days.reduce((sum, item) => sum + doneIn(item), 0);
  const show = (index: number) => { setOpen(index); requestAnimationFrame(() => document.getElementById(`anexo-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  return <div className="plan-view">
    <p className="eyebrow">{content.titulo}</p>
    <h1>{isToday ? `Hoje · ${WEEKDAY_NAMES[day]}` : WEEKDAY_NAMES[day]}</h1>
    {days.length > 0 && <nav className="plan-days" aria-label="Dias da semana">{days.map((item) => <button key={item.dia} type="button" className={`plan-day${item.dia === day ? " is-on" : ""}`} aria-pressed={item.dia === day} onClick={() => setDay(item.dia)}>{WEEKDAY_NAMES[item.dia].slice(0, 3)}{item.dia === new Date().getDay() ? " ·hoje" : ""}{done && (item.atividades?.length ?? 0) > 0 && doneIn(item) === item.atividades!.length ? <span className="plan-day-done" aria-label=", concluído"> ✓</span> : null}</button>)}</nav>}
    {done && current && activities.length > 0 && <section className="plan-progress" aria-label="Seu progresso">
      <div className="plan-progress-row"><strong>{dayDone === activities.length ? "Dia concluído! 🎉" : `${dayDone} de ${activities.length} atividades concluídas`}</strong><span className="muted">Semana: {weekDone} de {weekTotal}</span></div>
      <div className="plan-progress-bar" role="progressbar" aria-label={`Atividades concluídas em ${WEEKDAY_NAMES[day].toLowerCase()}`} aria-valuemin={0} aria-valuemax={activities.length} aria-valuenow={dayDone}><span style={{ width: `${Math.round((100 * dayDone) / activities.length)}%` }} /></div>
      {progressError && <p className="auth-error" role="alert">{progressError}</p>}
    </section>}
    {current && activities.length > 0 && <ol className="plan-activities" aria-label="Atividades do dia">{activities.map((activity, position) => {
      const trail = annexFor(activity.titulo, annexes);
      // "Questões do dia" abre primeiro o banco do app nas disciplinas do dia; a trilha de cada disciplina, as questões dela.
      const isQuestions = /^quest/i.test(fold(activity.titulo).trim());
      const vade = /^vade/i.test(fold(activity.titulo).trim()) ? vadeFor(activity.titulo).filter((slug) => content.vade?.includes(slug)) : [];
      const ownBank = isQuestions ? dayDisciplines : /^trilha/i.test(fold(activity.titulo).trim()) ? bankDisciplinesFor(activity.titulo) : [];
      const doneKey = `${week[day]}|${dayKeys[position]}`; const isDone = Boolean(done?.has(doneKey));
      return <li key={position} className={`plan-activity${isDone ? " is-done" : ""}`}>
        <div className="plan-activity-head"><span className="plan-activity-n" aria-hidden={isDone || undefined}>{isDone ? "✓" : position + 1}</span><strong>{activity.titulo}</strong>{activity.tempo && <span className="badge">{activity.tempo}</span>}</div>
        {done && <button type="button" className={`plan-check${isDone ? " is-on" : ""}`} aria-pressed={isDone} disabled={saving === doneKey} onClick={() => void toggle(week[day], dayKeys[position])}>
          <span className="plan-check-box" aria-hidden="true">{isDone ? "✓" : ""}</span>Atividade concluída
        </button>}
        {(activity.links.length > 0 || trail !== null || ownBank.length > 0 || vade.length > 0) && <div className="plan-links">
          {vade.map((slug) => {
            // No leitor do app quando o Vade Esperto já foi publicado lá; senão, o PDF.
            const reader = content.vadeLeitor?.[slug]; const label = vade.length > 1 ? `Vade Esperto · ${vadeMaterial(slug)?.titulo}` : "Abrir o Vade Esperto";
            return reader ? <Link key={slug} className="button primary" href={`/disciplinas/${reader}`}>{label} →</Link> : <a key={slug} className="button primary" href={`/api/vade-esperto/${slug}`} target="_blank" rel="noopener">{label} ↗</a>;
          })}
          {ownBank.length > 0 && <Link className="button primary" href={questionBankHref(ownBank)}>{isQuestions ? "Banco de questões DUO" : "Questões no app"} →</Link>}
          {activity.links.map((link) => <a key={link.href} className="button" href={link.href} target="_blank" rel="noopener noreferrer">{link.rotulo} ↗</a>)}
          {trail !== null && <button type="button" className="button ghost" onClick={() => show(trail)}>Ver a trilha ↓</button>}
        </div>}
      </li>;
    })}</ol>}
    {current ? (activities.length > 0
      ? <details className="plan-general"><summary>Orientações completas do dia</summary><article className="plan-html" dangerouslySetInnerHTML={{ __html: current.html }} /></details>
      : <article className="plan-html" dangerouslySetInnerHTML={{ __html: current.html }} />)
      : <p className="empty">{days.length ? `Sem atividades previstas para ${WEEKDAY_NAMES[day].toLowerCase()} neste cronograma. Aproveite para revisar ou descansar.` : "Este cronograma não separa os dias da semana; veja o conteúdo completo abaixo."}</p>}
    {annexes.length > 0 && <section className="plan-annexes" aria-label="Trilhas e materiais do cronograma"><h2 className="section-title">Trilhas e materiais</h2>
      {annexes.map((annex) => <details key={annex.index} id={`anexo-${annex.index}`} className="plan-general" open={open === annex.index} onToggle={(event) => { if ((event.target as HTMLDetailsElement).open) setOpen(annex.index); else if (open === annex.index) setOpen(null); }}><summary>{annex.titulo}</summary><div className="plan-html" dangerouslySetInnerHTML={{ __html: annex.html }} /></details>)}
    </section>}
    {content.geral && <details className="plan-general" open={!days.length}><summary>Orientações e visão geral da semana</summary><div className="plan-html" dangerouslySetInnerHTML={{ __html: content.geral }} /></details>}
    <p><Link href="/">← Trocar de cronograma</Link></p>
  </div>;
}
