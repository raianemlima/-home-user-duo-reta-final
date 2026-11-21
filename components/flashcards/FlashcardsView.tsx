"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardFace } from "@/components/flashcards/CardFace";
import { FlashcardSheet } from "@/components/flashcards/FlashcardSheet";
import { Review } from "@/components/flashcards/Review";
import { type Card, callApi, materialLink, shortDate } from "@/lib/flashcards/client";

const PAGE = 50;
type Payload = { disponivel: boolean; hoje: string; cards: Card[] };

// Página Flashcards: quantos cartões vencem hoje, a revisão e a lista com busca, edição e exclusão.
export function FlashcardsView({ examDate }: { examDate: string | null }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [busca, setBusca] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [reviewing, setReviewing] = useState<Card[] | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [toast, setToast] = useState("");
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2500); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { callApi<Payload>("/api/flashcards").then(setData).catch((failure) => setError(failure instanceof Error ? failure.message : "Não foi possível carregar seus cartões.")); }, []);

  const cards = useMemo(() => data?.cards ?? [], [data]);
  const disciplinas = useMemo(() => [...new Set(cards.map((card) => card.disciplineTitle).filter(Boolean))].sort() as string[], [cards]);
  const filtered = useMemo(() => cards.filter((card) => !disciplina || card.disciplineTitle === disciplina), [cards, disciplina]);
  const due = useMemo(() => data ? filtered.filter((card) => card.dueOn <= data.hoje).sort((a, b) => a.dueOn.localeCompare(b.dueOn)) : [], [filtered, data]);
  const listed = useMemo(() => {
    const term = busca.trim().toLocaleLowerCase("pt-BR");
    return filtered.filter((card) => !term || `${card.texto} ${card.pergunta ?? ""} ${card.origem}`.toLocaleLowerCase("pt-BR").includes(term)).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  }, [filtered, busca]);

  const patchCard = (id: string, changes: Partial<Card>) => setData((current) => current && { ...current, cards: current.cards.map((card) => card.id === id ? { ...card, ...changes } : card) });
  async function remove(card: Card) {
    if (!window.confirm("Excluir este cartão?")) return;
    try { await callApi(`/api/flashcards/${card.id}`, "DELETE"); setData((current) => current && { ...current, cards: current.cards.filter((item) => item.id !== card.id) }); setToast("Cartão excluído"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível excluir o cartão."); }
  }

  if (error && !data) return <p className="reader-notice" role="alert">{error}</p>;
  if (!data) return <p className="muted" role="status">Carregando seus cartões…</p>;
  if (!data.disponivel) return <p className="empty">Os flashcards ainda não estão disponíveis. Volte em breve.</p>;
  if (reviewing) return <Review cards={reviewing} hoje={data.hoje} examDate={examDate} onAnswered={(id, next) => patchCard(id, next)} onExit={() => setReviewing(null)} />;

  return <div className="flash-page">
    {error && <p className="reader-notice" role="alert">{error} <button className="icon-button" onClick={() => setError("")} aria-label="Fechar aviso">✕</button></p>}
    {cards.length === 0
      ? <div className="empty flash-empty">
          <p><strong>Você ainda não tem cartões.</strong></p>
          <p>Abra um ebook, selecione um trecho e toque em <strong>Flashcard</strong>. Você escolhe as palavras que quer esconder (lacuna) ou escreve uma pergunta.</p>
          <Link className="button primary" href="/">Ir para os ebooks</Link>
        </div>
      : <>
          <section className="flash-summary" aria-label="Resumo dos flashcards">
            <p><strong className="flash-due">{due.length}</strong> {due.length === 1 ? "para revisar hoje" : "para revisar hoje"}<span className="muted"> · {filtered.length} {filtered.length === 1 ? "cartão" : "cartões"}{disciplina ? ` em ${disciplina}` : " no total"}</span></p>
            {disciplinas.length > 1 && <label className="flash-filter">Disciplina<select value={disciplina} onChange={(event) => { setDisciplina(event.target.value); setShown(PAGE); }}><option value="">Todas</option>{disciplinas.map((title) => <option key={title}>{title}</option>)}</select></label>}
            {due.length > 0
              ? <button type="button" className="button primary" onClick={() => setReviewing(due)}>Revisar agora</button>
              : <p className="muted">Tudo em dia por hoje. ✓</p>}
          </section>
          <h2 className="section-title">Meus cartões</h2>
          <label className="flash-search"><span className="visually-hidden">Buscar nos cartões</span><input type="search" placeholder="Buscar nos cartões" value={busca} onChange={(event) => { setBusca(event.target.value); setShown(PAGE); }} /></label>
          {listed.length === 0 && <p className="muted">Nenhum cartão encontrado.</p>}
          <ul className="flash-list">
            {listed.slice(0, shown).map((card) => { const link = materialLink(card); return <li key={card.id} className="flash-item">
              <p className="eyebrow">{card.origem || card.disciplineTitle}</p>
              <CardFace card={card} side="frente" />
              <div className="flash-item-foot">
                <span className={card.dueOn <= data.hoje ? "badge" : "muted"}>{card.dueOn <= data.hoje ? "Para hoje" : `Volta em ${shortDate(card.dueOn)}`}</span>
                <span className="flash-item-actions">
                  {link && <Link className="button ghost" href={link}>Ver no material</Link>}
                  <button type="button" className="button ghost" onClick={() => setEditing(card)}>Editar</button>
                  <button type="button" className="button ghost flash-delete" onClick={() => remove(card)}>Excluir</button>
                </span>
              </div>
            </li>; })}
          </ul>
          {listed.length > shown && <button type="button" className="button" onClick={() => setShown((count) => count + PAGE)}>Mostrar mais cartões</button>}
        </>}
    {editing && <FlashcardSheet editing texto={editing.texto} initial={{ tipo: editing.tipo, pergunta: editing.pergunta ?? "", lacunas: editing.lacunas }} onClose={() => setEditing(null)}
      onSave={async (draft) => { const body = editing.tipo === "pergunta" ? { pergunta: draft.pergunta } : { lacunas: draft.lacunas }; await callApi(`/api/flashcards/${editing.id}`, "PATCH", body); patchCard(editing.id, body); setEditing(null); setToast("Cartão salvo ✓"); }} />}
    {toast && <p className="toast" role="status">{toast}</p>}
  </div>;
}
