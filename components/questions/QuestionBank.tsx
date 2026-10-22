"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type Answer, parseQuestionFilter, type QuestionView, searchQuestions, type Situation } from "@/lib/questions/bank";
import type { Fundamentacao, Letter, Question } from "@/lib/questions/types";

type Bank = { questions: Question[]; answers: Map<string, Answer> };
const FILTERS = ["disciplina", "assunto", "ano", "banca", "orgao", "situacao", "busca"] as const;
const SITUATIONS: [Situation, string][] = [["todas", "Todas"], ["nao-respondidas", "Não respondidas"], ["acertei", "Acertei"], ["errei", "Errei"]];

function Select({ label, name, value, options, onChange }: { label: string; name: string; value: string; options: [string, number][]; onChange: (name: string, value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(name, event.target.value)}>
    <option value="">Todos</option>
    {options.map(([option, total]) => <option key={option} value={option}>{option} ({total})</option>)}
  </select></label>;
}

// Fundamentação legal do gabarito: só é buscada quando o aluno já viu a correção, para a primeira carga ficar leve.
function LegalBasis({ questionId }: { questionId: string }) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data: Fundamentacao | null }>({ status: "loading", data: null });
  // Um cartão por questão (a lista usa key={question.id}), então questionId não muda: busca uma vez só.
  useEffect(() => {
    let alive = true;
    fetch(`/api/questoes/${encodeURIComponent(questionId)}/fundamentacao`).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("");
      if (alive) setState({ status: "ready", data: payload.fundamentacao ?? null });
    }).catch(() => { if (alive) setState({ status: "error", data: null }); });
    return () => { alive = false; };
  }, [questionId]);

  if (state.status === "loading") return <p className="q-basis-wait muted" role="status">Carregando a fundamentação…</p>;
  if (state.status === "error") return <p className="q-basis-wait muted" role="status">Não foi possível carregar a fundamentação agora.</p>;
  if (!state.data) return null;
  const { nota, dispositivos, conferido, ressalva } = state.data;
  return <section className="q-basis" aria-label="Fundamentação legal">
    <h3>Fundamentação legal</h3>
    <p className="q-basis-note">{nota}</p>
    {ressalva && <p className="q-basis-caveat"><strong>Atenção:</strong> {ressalva}</p>}
    <ol className="q-basis-list">
      {dispositivos.map((dispositivo) => <li key={dispositivo.ref}>
        <p className="q-basis-ref">{dispositivo.ref} <span className="q-basis-kind">{dispositivo.tipo === "lei" ? "texto da lei" : "entendimento (resumo)"}</span></p>
        {dispositivo.tipo === "lei"
          ? <blockquote className="q-basis-text">{dispositivo.texto}</blockquote>
          : <p className="q-basis-gist">{dispositivo.texto}</p>}
        {dispositivo.url && <a className="q-basis-src" href={dispositivo.url} target="_blank" rel="noreferrer noopener">Conferir na fonte oficial ↗</a>}
      </li>)}
    </ol>
    <p className="q-basis-checked muted">Os trechos marcados como <em>texto da lei</em> são transcrição literal da fonte oficial; conferido em {new Date(`${conferido}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}.</p>
  </section>;
}

function QuestionCard({ question, onAnswered }: { question: QuestionView; onAnswered: (id: string, choice: Letter, correct: boolean) => void }) {
  const [error, setError] = useState(""); const [retry, setRetry] = useState(false);
  const answer = retry ? null : question.resposta;
  // Corrige na hora, no aparelho; a resposta é salva em seguida sem prender a tela.
  function save(choice: Letter) {
    setError("");
    fetch("/api/questoes/responder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: question.id, choice }) })
      .then(async (response) => { if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload?.error?.message ?? ""); } })
      .catch((failure: Error) => setError(`Sua resposta não foi salva${failure.message ? ` (${failure.message})` : ""}. Confira a conexão e responda de novo.`));
  }
  function choose(choice: Letter) {
    if (answer) return;
    const correct = question.anulada || choice === question.gabarito;
    setRetry(false); onAnswered(question.id, choice, correct); save(choice);
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
        return <li key={letter}><button type="button" className={`q-alt ${state}`.trim()} onClick={() => choose(letter)} disabled={Boolean(answer)} aria-pressed={chosen}>
          <span className="q-letter" aria-hidden="true">{letter}</span><span>{question.alternativas[letter]}</span>
          {answer && isAnswer && <span className="q-mark">✓ gabarito</span>}{answer && chosen && !isAnswer && <span className="q-mark">✗ sua resposta</span>}
        </button></li>;
      })}
    </ol>
    {answer && <p className={answer.correct ? "q-result ok" : "q-result bad"} role="status">{answer.correct ? "Você acertou!" : `Você marcou ${answer.choice}. Gabarito: ${question.gabarito ?? "anulada"}.`} <button type="button" className="button ghost" onClick={() => setRetry(true)}>Responder de novo</button></p>}
    {answer && !answer.correct && question.gabarito && <p className="q-right"><strong>Alternativa correta ({question.gabarito}):</strong> {question.alternativas[question.gabarito]}</p>}
    {answer && question.comentario && <details className="q-comment" open><summary>Gabarito comentado</summary>{question.comentario.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</details>}
    {answer && <LegalBasis questionId={question.id} />}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </article>;
}

// Banco de questões: carrega tudo uma vez e filtra no aparelho por disciplina, assunto, ano, banca, órgão e situação.
export function QuestionBank() {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const [bank, setBank] = useState<Bank | null>(null); const [error, setError] = useState("");
  const [search, setSearch] = useState(params.get("busca") ?? "");
  const query = params.toString();

  useEffect(() => {
    let alive = true;
    fetch("/api/questoes").then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? "Não foi possível carregar as questões.");
      if (alive) { setBank({ questions: payload.questions, answers: new Map(Object.entries(payload.answers ?? {})) }); setError(""); }
    }).catch((failure: Error) => { if (alive) setError(failure.message); });
    return () => { alive = false; };
  }, []);

  const result = useMemo(() => (bank ? searchQuestions(bank.questions, parseQuestionFilter(new URLSearchParams(query)), bank.answers) : null), [bank, query]);
  const update = useCallback((changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    if (!("pagina" in changes)) next.delete("pagina");
    if ("disciplina" in changes) next.delete("assunto");
    router.replace(`${pathname}?${next.toString()}`, { scroll: "pagina" in changes });
  }, [params, pathname, router]);
  const onSelect = (name: string, value: string) => update({ [name]: value });
  function submitSearch(event: FormEvent) { event.preventDefault(); update({ busca: search.trim() }); }
  function onAnswered(id: string, choice: Letter, correct: boolean) {
    setBank((current) => current && { ...current, answers: new Map(current.answers).set(id, { choice, correct }) });
  }

  const value = (name: (typeof FILTERS)[number]) => params.get(name) ?? "";
  const active = FILTERS.some((name) => params.get(name));
  const facets = result?.facets;
  const rate = result && result.stats.respondidas ? Math.round((100 * result.stats.acertos) / result.stats.respondidas) : null;
  return <div className="question-bank">
    <p className="eyebrow">Reta Final DPE-SP</p><h1>Banco de questões</h1>
    <p className="muted">Provas da DPE-SP e de Defensor da FCC desde 2021.{result ? ` Você respondeu ${result.stats.respondidas} de ${result.stats.total}${rate !== null ? ` · ${rate}% de acerto` : ""}.` : ""}</p>
    <form className="qb-search" onSubmit={submitSearch} role="search"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar palavras no enunciado ou nas alternativas" aria-label="Buscar questões" /><button className="button" type="submit">Buscar</button></form>
    {facets && <div className="qb-filters">
      <Select label="Disciplina" name="disciplina" value={value("disciplina")} options={facets.disciplinas} onChange={onSelect} />
      {facets.assuntos.length > 0 && <Select label="Assunto" name="assunto" value={value("assunto")} options={facets.assuntos} onChange={onSelect} />}
      <Select label="Ano" name="ano" value={value("ano")} options={facets.anos} onChange={onSelect} />
      <Select label="Banca" name="banca" value={value("banca")} options={facets.bancas} onChange={onSelect} />
      <Select label="Órgão" name="orgao" value={value("orgao")} options={facets.orgaos} onChange={onSelect} />
      <label>Situação<select value={value("situacao") || "todas"} onChange={(event) => onSelect("situacao", event.target.value === "todas" ? "" : event.target.value)}>{SITUATIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>}
    <div className="notebook-summary"><span role="status">{!result && !error ? "Carregando…" : result ? `${result.total} ${result.total === 1 ? "questão encontrada" : "questões encontradas"}` : ""}</span>{active && <button className="button ghost" onClick={() => { setSearch(""); router.replace(pathname); }}>Limpar filtros</button>}</div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {result && !result.total && <p className="empty">Nenhuma questão com esses filtros.</p>}
    <div className="q-list">{result?.items.map((question: QuestionView) => <QuestionCard key={question.id} question={question} onAnswered={onAnswered} />)}</div>
    {result && result.paginas > 1 && <nav className="section-nav" aria-label="Páginas">
      {result.pagina > 1 ? <button className="button" onClick={() => update({ pagina: String(result.pagina - 1) })}>← Anteriores</button> : <span />}
      <span className="muted">Página {result.pagina} de {result.paginas}</span>
      {result.pagina < result.paginas ? <button className="button primary" onClick={() => update({ pagina: String(result.pagina + 1) })}>Próximas →</button> : <span />}
    </nav>}
  </div>;
}
