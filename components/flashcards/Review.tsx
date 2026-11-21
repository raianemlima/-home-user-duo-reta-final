"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CardFace } from "@/components/flashcards/CardFace";
import { type Card, callApi, materialLink } from "@/lib/flashcards/client";
import { previewLabels, RATINGS, type Rating, type Sched } from "@/lib/flashcards/schedule";

// Revisão no estilo do Anki: frente → "Mostrar resposta" → Errei / Difícil / Bom / Fácil. "Errei" põe o cartão no fim
// da fila desta revisão. Atalhos: espaço mostra a resposta; 1 a 4 escolhem a nota.
export function Review({ cards, hoje, examDate, onAnswered, onExit }: { cards: Card[]; hoje: string; examDate: string | null; onAnswered: (id: string, next: Sched & { dueOn: string }) => void; onExit: () => void }) {
  const [queue, setQueue] = useState(cards);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const total = cards.length;
  const card = queue[0];

  async function rate(nota: Rating) {
    if (!card || saving) return;
    setSaving(true); setError("");
    try {
      const next = await callApi<Sched & { dueOn: string }>(`/api/flashcards/${card.id}/revisar`, "POST", { nota });
      onAnswered(card.id, next);
      setQueue((current) => nota === "errei" ? [...current.slice(1), { ...card, ...next }] : current.slice(1));
      if (nota !== "errei") setDone((count) => count + 1);
      setRevealed(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar a resposta."); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (!revealed && (event.key === " " || event.key === "Enter")) { event.preventDefault(); setRevealed(true); }
      else if (revealed && ["1", "2", "3", "4"].includes(event.key)) void rate(RATINGS[Number(event.key) - 1].key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) return <section className="flash-review flash-done" aria-live="polite">
    <p className="flash-done-title">Revisão do dia concluída 🎉</p>
    <p className="muted">{total} {total === 1 ? "cartão revisado" : "cartões revisados"}. Amanhã tem mais.</p>
    <button type="button" className="button primary" onClick={onExit}>Voltar aos cartões</button>
  </section>;

  const labels = previewLabels(card, hoje, examDate);
  const link = materialLink(card);
  return <section className="flash-review" aria-label="Revisão de flashcards">
    <div className="flash-review-head">
      <span className="muted">{Math.min(done + 1, total)} de {total}{queue.length > total - done ? " · repetindo os que você errou" : ""}</span>
      <button type="button" className="button ghost" onClick={onExit}>Sair da revisão</button>
    </div>
    <div className="plan-progress-bar" role="progressbar" aria-label="Cartões revisados" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><span style={{ width: `${Math.round((100 * done) / Math.max(1, total))}%` }} /></div>
    <article className="flash-card" aria-live="polite">
      <p className="eyebrow">{card.origem || card.disciplineTitle || "Flashcard"}</p>
      <CardFace card={card} side={revealed ? "verso" : "frente"} />
      {revealed && link && <Link className="flash-source" href={link}>Ver no material →</Link>}
    </article>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {!revealed
      ? <button type="button" className="button primary full" onClick={() => setRevealed(true)}>Mostrar resposta</button>
      : <div className="flash-rates" role="group" aria-label="Como foi?">
          {RATINGS.map((rating, index) => <button key={rating.key} type="button" className={`button flash-rate flash-${rating.key}`} disabled={saving} onClick={() => rate(rating.key)} aria-keyshortcuts={String(index + 1)}>
            <span>{rating.label}</span><small>{labels[rating.key]}</small>
          </button>)}
        </div>}
  </section>;
}
