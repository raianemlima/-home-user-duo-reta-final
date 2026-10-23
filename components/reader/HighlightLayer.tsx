"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Floating } from "@/components/reader/Floating";
import { ColorLegend, HighlightToolbar } from "@/components/reader/HighlightToolbar";
import { paragraphSpans, rangeToPoints, segmentText } from "@/lib/highlights/dom";
import { markLead, paragraphFormat, tipRoles } from "@/lib/reader/format";
import { HIGHLIGHT_COLORS, type HighlightColor, type Point } from "@/lib/highlights/types";
import type { ReaderParagraph } from "@/lib/reader/queries";
import { piecesOf, tableLayout } from "@/lib/reader/table";

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
// breaks: título de cada seção seguinte da mesma página de leitura, desenhado antes do primeiro parágrafo dela.
export function HighlightLayer({ versionId, sectionId, paragraphs, breaks }: { versionId: string; sectionId: string; paragraphs: ReaderParagraph[]; breaks?: Record<string, { sectionId: string; label: string; hidden?: boolean }[]> }) {
  const root = useRef<HTMLDivElement>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; note: string; color: HighlightColor } | null>(null);
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState("");
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2500); return () => window.clearTimeout(timer); }, [toast]);

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
    try { const { highlight } = await call("/api/destaques", "POST", { versionId, ...selection, color, note }); setHighlights((list) => list.map((item) => (item.id === temp.id ? highlight : item))); setToast(note ? "Anotação salva ✓" : "Grifo salvo ✓"); }
    catch (error) { setHighlights((list) => list.filter((item) => item.id !== temp.id)); setNotice(error instanceof Error ? error.message : "Não foi possível salvar o grifo. Tente de novo."); }
  }
  async function update(id: string, changes: Partial<{ color: HighlightColor; note: string }>) {
    const before = highlights;
    setHighlights((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    try { await call(`/api/destaques/${id}`, "PATCH", changes); setToast(changes.note !== undefined ? "Anotação salva ✓" : "Cor alterada ✓"); } catch (error) { setHighlights(before); setNotice(error instanceof Error ? error.message : "Não foi possível alterar o grifo."); }
  }
  async function remove(id: string) {
    const before = highlights;
    setHighlights((list) => list.filter((item) => item.id !== id)); setEditing(null);
    try { await call(`/api/destaques/${id}`, "DELETE"); } catch { setHighlights(before); setNotice("Não foi possível excluir o grifo."); }
  }

  const tips = useMemo(() => tipRoles(paragraphs), [paragraphs]);
  const order = useMemo(() => paragraphs.map((paragraph) => paragraph.id), [paragraphs]);
  const spans = useMemo(() => paragraphSpans(order, highlights), [order, highlights]);
  const notesOf = (paragraphId: string) => highlights.filter((item) => item.note && item.start.paragraphId === paragraphId);
  const noteOf = (id: string) => highlights.find((item) => item.id === id)?.note ?? null;
  const open = editing?.id ? highlights.find((item) => item.id === editing.id) : null;

  return <>
    <ColorLegend />
    {notice && <p className="reader-notice" role="alert">{notice} <button className="icon-button" onClick={() => setNotice("")} aria-label="Fechar aviso">✕</button></p>}
    <div className="section-text" data-section-id={sectionId} ref={root} onMouseUp={capture} onTouchEnd={capture}>
      {paragraphs.map((paragraph) => {
        const format = paragraphFormat(paragraph.text, paragraph.kind);
        const segments = markLead(segmentText(paragraph.text, spans.get(paragraph.id) ?? []), format.lead);
        const renderSegment = (segment: (typeof segments)[number], index: number | string) => segment.marks.length
          ? <mark key={index} className={`hl hl-${segment.marks[segment.marks.length - 1].color}${segment.lead ? " lead" : ""}${noteOf(segment.marks[segment.marks.length - 1].id) ? " has-note" : ""}`} title={noteOf(segment.marks[segment.marks.length - 1].id) ?? undefined} data-highlight-id={segment.marks[segment.marks.length - 1].id} tabIndex={0} role="button" aria-label="Grifo: abrir opções"
              onClick={() => { const id = segment.marks[segment.marks.length - 1].id; if (!id.startsWith("tmp-")) { const found = highlights.find((item) => item.id === id); setEditing({ id, note: found?.note ?? "", color: found?.color ?? "importante" }); }; }}
              onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLElement).click(); }}>{segment.text}</mark>
          : <span key={index} className={segment.lead ? "lead" : undefined}>{segment.text}</span>;
        const table = paragraph.kind === "table" ? tableLayout(paragraph.text) : null;
        const subheads = breaks?.[paragraph.id] ?? [];
        return <Fragment key={paragraph.id}>{subheads.map((subhead) => subhead.hidden ? <span key={subhead.sectionId} className="section-anchor" id={`s-${subhead.sectionId}`} /> : <h2 key={subhead.sectionId} className="section-subhead" id={`s-${subhead.sectionId}`}>{subhead.label}</h2>)}{table
          // Tabela do material desenhada como tabela; o texto (com os separadores escondidos) é o mesmo, então os grifos continuam valendo.
          ? <div id={`p-${paragraph.id}`} className="paragraph paragraph-table table-wrap" data-paragraph-id={paragraph.id}><table className="material-table"><tbody>
              {table.map((row, r) => <tr key={r}>{row.map((cell, c) => { const Cell = r === 0 && table.length > 1 ? "th" : "td"; return <Cell key={c} colSpan={cell.span > 1 ? cell.span : undefined}>{piecesOf(segments, cell.from, cell.to).flatMap((piece, k) => piece.text.split("\u2028").map((part, n) => <Fragment key={`${c}-${k}-${n}`}>{n > 0 && <><span className="tsep">{"\u2028"}</span><br /></>}{part && renderSegment({ ...piece, text: part }, `${c}-${k}-${n}`)}</Fragment>))}{cell.sepTo > cell.to && <span className="tsep">{paragraph.text.slice(cell.to, cell.sepTo)}</span>}</Cell>; })}</tr>)}
            </tbody></table></div>
          : <p id={`p-${paragraph.id}`} className={`paragraph paragraph-${paragraph.kind} ${format.className} ${tips.get(paragraph.id) ?? ""}`.trim()} data-paragraph-id={paragraph.id}>
              {segments.map((segment, index) => renderSegment(segment, index))}
            </p>}
      {notesOf(paragraph.id).map((item) => <aside key={item.id} className="para-note" style={{ borderColor: swatch(item.color) }} role="button" tabIndex={0} aria-label="Abrir anotação"
          onClick={() => { if (!item.id.startsWith("tmp-")) setEditing({ id: item.id, note: item.note ?? "", color: item.color }); }}
          onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLElement).click(); }}><span aria-hidden="true">✎</span> {item.note}</aside>)}</Fragment>; })}
    </div>
    {selection && !editing && <HighlightToolbar onPick={(color) => save(color)} onNote={() => setEditing({ id: null, note: "", color: "importante" })} onCancel={() => { setSelection(null); window.getSelection()?.removeAllRanges(); }} />}
    {editing && <Floating className="sheet" role="dialog" aria-label={open ? "Editar grifo" : "Novo grifo com anotação"}>
      <label>Anotação<textarea rows={3} maxLength={2000} autoFocus value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} /></label>
      <div className="sheet-colors" role="radiogroup" aria-label="Cor do grifo">{HIGHLIGHT_COLORS.map((color) => <button key={color.key} role="radio" aria-checked={editing.color === color.key} className={editing.color === color.key ? "swatch-button selected" : "swatch-button"} onClick={() => setEditing({ ...editing, color: color.key })}><span className="swatch" style={{ background: color.swatch }} aria-hidden="true" />{color.label}</button>)}</div>
      <div className="sheet-actions">
        <button className="button primary" onClick={() => { if (open) { void update(open.id, { color: editing.color, note: editing.note }); setEditing(null); } else void save(editing.color, editing.note); }}>Salvar anotação</button>
        {open && <button className="button danger" onClick={() => remove(open.id)}>Excluir grifo</button>}
        <button className="button ghost" onClick={() => { setEditing(null); setSelection(null); }}>Fechar</button>
      </div>
    </Floating>}
    {toast && <p className="toast" role="status">{toast}</p>}
  </>;
}
