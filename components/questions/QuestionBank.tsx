"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Facets, QuestionView, Situation } from "@/lib/questions/bank";
import type { Letter } from "@/lib/questions/types";

type Result = { total: number; pagina: number; paginas: number; items: QuestionView[]; facets: Facets; stats: { respondidas: number; acertos: number; total: number } };
const FILTERS = ["disciplina", "assunto", "ano", "banca", "orgao", "situacao", "busca"] as const;
const SITUATIONS: [Situation, string][] = [["todas", "Todas"], ["nao-respondidas", "Não respondidas"], ["acertei", "Acertei"], ["errei", "Errei"]];

function Select({ label, name, value, options, onChange }: { label: string; name: string; value: string; options: [string, number][]; onChange: (name: string, value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(name, event.target.value)}>
    <option value="">Todos</option>
    {options.map(([option, total]) => <option key={option} value={option}>{option} ({total})</option>)}
  </select></label>;
}

function QuestionCard({ question, onAnswered }: { question: QuestionView; onAnswered: (id: string, choice: Letter, correct: boolean, gabarito: Letter | null) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [retry, setRetry] = useState(false);
  const answer = retry ? null : question.resposta;
  async function choose(choice: Letter) {
    if (answer || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/questoes/responder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: question.id, choice }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? "Não foi possível salvar a resposta.");
      setRetry(false); onAnswered(question.id, choice, payload.correct, payload.gabarito);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar a resposta."); }
    finally { setBusy(false); }
  }
  const letters = Object.keys(question.alternativas) as Letter[];
  return <article className="q-card" aria-labelledby={`q-${question.id}`}>
    <p className="q-meta"><strong>{question.concurso}</strong> · {question.banca} · {question.disciplina}{question.assunto ? ` › ${question.assunto}` : ""}</p>
    <p id={`q-${question.id}`} className="q-text">{question.enunciado}</p>
    {question.anulada && <p className="q-note">Questão anulada pela banca: qualquer alternativa conta como acerto.</p>}
    <ol className="q-alts" aria-label="Alternativas">
      {letters.map((letter) => {
        const chosen = answer?.choice === letter, isAnswer = Boolean(answer) && question.gabarito === letter;
        const state = !answer ? "" : isAnswer ? "is-answer" : chosen ? "is-wrong" : "is-dim";
        return <li key={letter}><button type="button" className={`q-alt ${state}`.trim()} onClick={() => choose(letter)} disabled={busy || Boolean(answer)} aria-pressed={chosen}>
          <span className="q-letter" aria-hidden="true">{letter}</span><span>{question.alternativas[letter]}</span>
          {answer && isAnswer && <span className="q-mark">✓ gabarito</span>}{answer && chosen && !isAnswer && <span className="q-mark">✗ sua resposta</span>}
        </button></li>;
      })}
    </ol>
    {answer && <p className={answer.correct ? "q-result ok" : "q-result bad"} role="status">{answer.correct ? "Você acertou!" : `Você marcou ${answer.choice}. Gabarito: ${question.gabarito ?? "anulada"}.`} <button type="button" className="button ghost" onClick={() => setRetry(true)}>Responder de novo</button></p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </article>;
}

// Banco de questões: filtros por disciplina, assunto, ano, banca, órgão e situação; a resposta do aluno fica salva.
export function QuestionBank() {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const [result, setResult] = useState<Result | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("busca") ?? "");
  const query = params.toString();

  useEffect(() => {
    let alive = true;
    fetch(`/api/questoes?${query}`).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? "Não foi possível carregar as questões.");
      if (alive) { setResult(payload); setError(""); }
    }).catch((failure: Error) => { if (alive) setError(failure.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query]);

  const update = useCallback((changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    if (!("pagina" in changes)) next.delete("pagina");
    if ("disciplina" in changes) next.delete("assunto");
    setLoading(true);
    router.replace(`${pathname}?${next.toString()}`, { scroll: "pagina" in changes });
  }, [params, pathname, router]);
  const onSelect = (name: string, value: string) => update({ [name]: value });
  function submitSearch(event: FormEvent) { event.preventDefault(); update({ busca: search.trim() }); }
  function onAnswered(id: string, choice: Letter, correct: boolean, gabarito: Letter | null) {
    setResult((current) => current && ({ ...current, stats: { ...current.stats, respondidas: current.stats.respondidas + (current.items.find((item) => item.id === id)?.resposta ? 0 : 1), acertos: current.stats.acertos + (correct ? 1 : 0) - (current.items.find((item) => item.id === id)?.resposta?.correct ? 1 : 0) }, items: current.items.map((item) => (item.id === id ? { ...item, gabarito, resposta: { choice, correct } } : item)) }));
  }

  const value = (name: (typeof FILTERS)[number]) => params.get(name) ?? "";
  const active = FILTERS.some((name) => params.get(name));
  const facets = result?.facets;
  const rate = result && result.stats.respondidas ? Math.round((100 * result.stats.acertos) / result.stats.respondidas) : null;
  return <div className="question-bank">
    <p className="eyebrow">Reta Final DPE-SP</p><h1>Banco de questões</h1>
    {result && <p className="muted">Você respondeu {result.stats.respondidas} de {result.stats.total} questões{rate !== null ? ` · ${rate}% de acerto` : ""}.</p>}
    <form className="qb-search" onSubmit={submitSearch} role="search"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar palavras no enunciado ou nas alternativas" aria-label="Buscar questões" /><button className="button" type="submit">Buscar</button></form>
    {facets && <div className="qb-filters">
      <Select label="Disciplina" name="disciplina" value={value("disciplina")} options={facets.disciplinas} onChange={onSelect} />
      {facets.assuntos.length > 0 && <Select label="Assunto" name="assunto" value={value("assunto")} options={facets.assuntos} onChange={onSelect} />}
      <Select label="Ano" name="ano" value={value("ano")} options={facets.anos} onChange={onSelect} />
      <Select label="Banca" name="banca" value={value("banca")} options={facets.bancas} onChange={onSelect} />
      <Select label="Órgão" name="orgao" value={value("orgao")} options={facets.orgaos} onChange={onSelect} />
      <label>Situação<select value={value("situacao") || "todas"} onChange={(event) => onSelect("situacao", event.target.value === "todas" ? "" : event.target.value)}>{SITUATIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>}
    <div className="notebook-summary"><span role="status">{loading ? "Carregando…" : result ? `${result.total} ${result.total === 1 ? "questão encontrada" : "questões encontradas"}` : ""}</span>{active && <button className="button ghost" onClick={() => { setSearch(""); setLoading(true); router.replace(pathname); }}>Limpar filtros</button>}</div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {result && !result.total && !loading && <p className="empty">Nenhuma questão com esses filtros.</p>}
    <div className="q-list">{result?.items.map((question) => <QuestionCard key={`${question.id}-${question.resposta?.choice ?? ""}`} question={question} onAnswered={onAnswered} />)}</div>
    {result && result.paginas > 1 && <nav className="section-nav" aria-label="Páginas">
      {result.pagina > 1 ? <button className="button" onClick={() => update({ pagina: String(result.pagina - 1) })}>← Anteriores</button> : <span />}
      <span className="muted">Página {result.pagina} de {result.paginas}</span>
      {result.pagina < result.paginas ? <button className="button primary" onClick={() => update({ pagina: String(result.pagina + 1) })}>Próximas →</button> : <span />}
    </nav>}
  </div>;
}
