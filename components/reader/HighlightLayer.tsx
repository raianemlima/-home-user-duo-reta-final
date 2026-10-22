"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Floating } from "@/components/reader/Floating";
import { ColorLegend, HighlightToolbar } from "@/components/reader/HighlightToolbar";
import { paragraphSpans, rangeToPoints, segmentText } from "@/lib/highlights/dom";
import { markLead, paragraphFormat } from "@/lib/reader/format";
import { HIGHLIGHT_COLORS, type HighlightColor, type Point } from "@/lib/highlights/types";
import type { ReaderParagraph } from "@/lib/reader/queries";

type Highlight = { id: string; start: Point; end: Point; quote: string; color: HighlightColor; note: string | null; reviewed: boolean };
type Selection = { start: Point; end: Point };
const swatch = (color: HighlightColor) => HIGHLIGHT_COLORS.find((item) => item.key === color)?.swatch;

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? "Não foi possível salvar o grifo. Tente de novo.");
  return payload;
}

// Texto da seção com os grifos do aluno. Marcas vêm do estado (React), nunca de manipulação direta do DOM.
export function HighlightLayer({ versionId, sectionId, paragraphs }: { versionId: string; sectionId: string; paragraphs: ReaderParagraph[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; note: string } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    call(`/api/destaques?versao=${versionId}`, "GET").then((payload) => { if (alive) setHighlights(payload.highlights); }).catch(() => { if (alive) setNotice("Não foi possível carregar seus grifos."); });
    return () => { alive = false; };
  }, [versionId]);

  const capture = useCallback(() => {
    const current = window.getSelection();
    if (!current || current.isCollapsed || !current.rangeCount || !root.current) return;
    const points = rangeToPoints(current.getRangeAt(0), root.current);
    if (points) setSelection(points);
  }, []);
  useEffect(() => {
    const onChange = () => { const current = window.getSelection(); if (!current || current.isCollapsed) return; window.clearTimeout(timer); timer = window.setTimeout(capture, 250); };
    let timer = 0;
    document.addEventListener("selectionchange", onChange);
    return () => { document.removeEventListener("selectionchange", onChange); window.clearTimeout(timer); };
  }, [capture]);

  async function save(color: HighlightColor, note = "") {
    if (!selection) return;
    const temp: Highlight = { id: `tmp-${Date.now()}`, ...selection, quote: "", color, note: note || null, reviewed: false };
    setHighlights((list) => [...list, temp]); setSelection(null); setEditing(null); window.getSelection()?.removeAllRanges();
    try { const { highlight } = await call("/api/destaques", "POST", { versionId, ...selection, color, note }); setHighlights((list) => list.map((item) => (item.id === temp.id ? highlight : item))); }
    catch (error) { setHighlights((list) => list.filter((item) => item.id !== temp.id)); setNotice(error instanceof Error ? error.message : "Não foi possível salvar o grifo. Tente de novo."); }
  }
  async function update(id: string, changes: Partial<{ color: HighlightColor; note: string }>) {
    const before = highlights;
    setHighlights((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    try { await call(`/api/destaques/${id}`, "PATCH", changes); } catch (error) { setHighlights(before); setNotice(error instanceof Error ? error.message : "Não foi possível alterar o grifo."); }
  }
  async function remove(id: string) {
    const before = highlights;
    setHighlights((list) => list.filter((item) => item.id !== id)); setEditing(null);
    try { await call(`/api/destaques/${id}`, "DELETE"); } catch { setHighlights(before); setNotice("Não foi possível excluir o grifo."); }
  }

  const order = useMemo(() => paragraphs.map((paragraph) => paragraph.id), [paragraphs]);
  const spans = useMemo(() => paragraphSpans(order, highlights), [order, highlights]);
  const open = editing?.id ? highlights.find((item) => item.id === editing.id) : null;

  return <>
    <ColorLegend />
    {notice && <p className="reader-notice" role="alert">{notice} <button className="icon-button" onClick={() => setNotice("")} aria-label="Fechar aviso">✕</button></p>}
    <div className="section-text" data-section-id={sectionId} ref={root} onMouseUp={capture} onTouchEnd={capture}>
      {paragraphs.map((paragraph) => { const format = paragraphFormat(paragraph.text, paragraph.kind); return <p key={paragraph.id} id={`p-${paragraph.id}`} className={`paragraph paragraph-${paragraph.kind} ${format.className}`.trim()} data-paragraph-id={paragraph.id}>
        {markLead(segmentText(paragraph.text, spans.get(paragraph.id) ?? []), format.lead).map((segment, index) => segment.marks.length
          ? <mark key={index} className={segment.lead ? "hl lead" : "hl"} data-highlight-id={segment.marks[segment.marks.length - 1].id} style={{ background: swatch(segment.marks[segment.marks.length - 1].color) }} tabIndex={0} role="button" aria-label="Grifo: abrir opções"
              onClick={() => { const id = segment.marks[segment.marks.length - 1].id; if (!id.startsWith("tmp-")) setEditing({ id, note: highlights.find((item) => item.id === id)?.note ?? "" }); }}
              onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLElement).click(); }}>{segment.text}</mark>
          : <span key={index} className={segment.lead ? "lead" : undefined}>{segment.text}</span>)}
      </p>; })}
    </div>
    {selection && !editing && <HighlightToolbar onPick={(color) => save(color)} onNote={() => setEditing({ id: null, note: "" })} onCancel={() => { setSelection(null); window.getSelection()?.removeAllRanges(); }} />}
    {editing && <Floating className="sheet" role="dialog" aria-label={open ? "Editar grifo" : "Novo grifo com anotação"}>
      <label>Anotação<textarea rows={3} maxLength={2000} value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} /></label>
      <div className="sheet-colors">{HIGHLIGHT_COLORS.map((color) => <button key={color.key} className={open?.color === color.key ? "swatch-button selected" : "swatch-button"} onClick={() => (open ? update(open.id, { color: color.key }) : save(color.key, editing.note))}><span className="swatch" style={{ background: color.swatch }} aria-hidden="true" />{color.label}</button>)}</div>
      <div className="sheet-actions">
        {open && <button className="button primary" onClick={() => { void update(open.id, { note: editing.note }); setEditing(null); }}>Salvar anotação</button>}
        {open && <button className="button danger" onClick={() => remove(open.id)}>Excluir grifo</button>}
        <button className="button ghost" onClick={() => { setEditing(null); setSelection(null); }}>Fechar</button>
      </div>
      {!open && <p className="muted">Escolha a cor para salvar o grifo com a anotação.</p>}
    </Floating>}
  </>;
}
