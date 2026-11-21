"use client";

import { useMemo, useState } from "react";
import { Floating } from "@/components/reader/Floating";
import { type Gap, gapsFrom, wordIndexesIn, wordsOf } from "@/lib/flashcards/cloze";

export type CardDraft = { tipo: "lacuna" | "pergunta"; pergunta: string; lacunas: Gap[] };
const MAX_PERGUNTA = 300;

// Janela para criar (ou editar) um flashcard a partir de um trecho. Lacuna: o aluno toca nas palavras que quer
// esconder. Pergunta: o aluno escreve a pergunta e o trecho fica como resposta.
export function FlashcardSheet({ texto, initial, editing = false, onSave, onClose }: { texto: string; initial?: CardDraft; editing?: boolean; onSave: (draft: CardDraft) => Promise<void>; onClose: () => void }) {
  const words = useMemo(() => wordsOf(texto), [texto]);
  const [tipo, setTipo] = useState<CardDraft["tipo"]>(initial?.tipo ?? "lacuna");
  const [picked, setPicked] = useState<Set<number>>(() => new Set(initial ? wordIndexesIn(texto, initial.lacunas) : []));
  const [pergunta, setPergunta] = useState(initial?.pergunta ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ready = tipo === "lacuna" ? picked.size > 0 : pergunta.trim().length > 0;
  const toggle = (index: number) => setPicked((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; });

  async function save() {
    if (!ready || saving) return;
    setSaving(true); setError("");
    try { await onSave({ tipo, pergunta: pergunta.trim(), lacunas: tipo === "lacuna" ? gapsFrom(texto, [...picked]) : [] }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar o cartão."); setSaving(false); }
  }

  // O trecho com as palavras como botões. Cada bloco sem espaço ("(art.", "dobro.") tem no máximo uma palavra: a pontuação
  // colada fica junto do botão, sem quebrar a linha entre elas; os espaços ficam como texto.
  const pieces: React.ReactNode[] = [];
  let offset = 0, next = 0;
  texto.split(/(\s+)/).forEach((chunk, key) => {
    const start = offset; offset += chunk.length;
    const word = words[next];
    if (!chunk || /^\s+$/.test(chunk) || !word || word.start >= offset) { if (chunk) pieces.push(<span key={key}>{chunk}</span>); return; }
    const index = next++, on = picked.has(index);
    pieces.push(<span key={key} className="flash-unit">{texto.slice(start, word.start)}<button type="button" className={on ? "flash-word is-on" : "flash-word"} aria-pressed={on} onClick={() => toggle(index)}>{texto.slice(word.start, word.end)}</button>{texto.slice(word.end, offset)}</span>);
  });

  return <Floating className="sheet flash-sheet" role="dialog" aria-label={editing ? "Editar flashcard" : "Novo flashcard"}>
    <p className="flash-sheet-title"><strong>{editing ? "Editar flashcard" : "Novo flashcard"}</strong></p>
    {!editing && <div className="flash-tabs" role="tablist" aria-label="Formato do cartão">
      <button type="button" role="tab" aria-selected={tipo === "lacuna"} className={tipo === "lacuna" ? "flash-tab is-on" : "flash-tab"} onClick={() => setTipo("lacuna")}>Lacuna</button>
      <button type="button" role="tab" aria-selected={tipo === "pergunta"} className={tipo === "pergunta" ? "flash-tab is-on" : "flash-tab"} onClick={() => setTipo("pergunta")}>Pergunta e resposta</button>
    </div>}
    {tipo === "lacuna"
      ? <>
          <p className="muted flash-help">Toque nas palavras que você quer esconder. {picked.size > 0 && <strong>{picked.size} {picked.size === 1 ? "palavra escondida" : "palavras escondidas"}.</strong>}</p>
          <div className="flash-pick" aria-label="Trecho do cartão">{pieces}</div>
        </>
      : <>
          <label className="flash-label">Pergunta (frente do cartão)<textarea rows={2} maxLength={MAX_PERGUNTA} autoFocus value={pergunta} onChange={(event) => setPergunta(event.target.value)} placeholder="Ex.: Qual é o prazo da Defensoria para recorrer?" /></label>
          <p className="muted flash-help">Resposta (verso):</p>
          <blockquote className="flash-quote">{texto}</blockquote>
        </>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="sheet-actions">
      <button type="button" className="button primary" disabled={!ready || saving} onClick={save}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar cartão"}</button>
      <button type="button" className="button ghost" onClick={onClose}>Cancelar</button>
    </div>
  </Floating>;
}
