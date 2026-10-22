"use client";

import Link from "next/link";
import { useState } from "react";
import { HIGHLIGHT_COLORS } from "@/lib/highlights/types";
import { notebookQuery } from "@/lib/notebook/filters";
import type { NotebookFilter, NotebookGroup, NotebookItem } from "@/lib/notebook/queries";

const swatch = (color: string) => HIGHLIGHT_COLORS.find((item) => item.key === color)?.swatch;
const label = (color: string) => HIGHLIGHT_COLORS.find((item) => item.key === color)?.label ?? color;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "");

function Item({ item }: { item: NotebookItem }) {
  const [note, setNote] = useState(item.note ?? ""); const [reviewed, setReviewed] = useState(item.reviewed); const [state, setState] = useState("");
  async function patch(changes: Record<string, unknown>) {
    setState("Salvando…");
    const response = await fetch(`/api/destaques/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes) }).catch(() => null);
    setState(response?.ok ? "Salvo" : "Não foi possível salvar. Tente de novo.");
    return Boolean(response?.ok);
  }
  return <li className={reviewed ? "note-item reviewed" : "note-item"} style={{ borderLeftColor: swatch(item.color) }}>
    <blockquote>{item.quote}</blockquote>
    {item.orphaned && <p className="orphan-notice">Este trecho mudou na atualização{item.orphanedAt ? ` de ${day(item.orphanedAt)}` : ""}. Seu grifo e sua anotação foram mantidos.</p>}
    <label className="visually-hidden" htmlFor={`nota-${item.id}`}>Anotação</label>
    <textarea id={`nota-${item.id}`} rows={2} maxLength={2000} placeholder="Sua anotação" value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => { if (note !== (item.note ?? "")) void patch({ note }); }} />
    <div className="note-actions">
      <span className="tag"><span className="swatch" style={{ background: swatch(item.color) }} aria-hidden="true" />{label(item.color)}</span>
      <button className="button ghost" onClick={async () => { const next = !reviewed; setReviewed(next); if (!(await patch({ reviewed: next }))) setReviewed(!next); }} aria-pressed={reviewed}>{reviewed ? "✓ Revisado" : "Marcar como revisado"}</button>
      {item.sectionId && <Link className="button ghost" href={`/disciplinas/${item.disciplineSlug}/${item.sectionId}#p-${item.paragraphId}`}>Ir ao trecho</Link>}
      {state && <span className="muted" role="status">{state}</span>}
    </div>
  </li>;
}

export function NotebookView({ groups, filter, disciplines }: { groups: NotebookGroup[]; filter: NotebookFilter; disciplines: { slug: string; title: string }[] }) {
  const exportHref = `/api/caderno/exportar?${notebookQuery(filter)}`;
  const total = groups.reduce((sum, group) => sum + group.topics.reduce((count, topic) => count + topic.items.length, 0), 0);
  return <div className="notebook">
    <p className="eyebrow">Reta Final DPE-SP</p>
    <h1>Caderno de revisão</h1>
    <form className="notebook-filters" method="get" action="/caderno">
      <label>Disciplina<select name="disciplinas" defaultValue={filter.disciplines?.[0] ?? ""}><option value="">Todas</option>{disciplines.map((discipline) => <option key={discipline.slug} value={discipline.slug}>{discipline.title}</option>)}</select></label>
      <label>Cor<select name="cores" defaultValue={filter.colors?.[0] ?? ""}><option value="">Todas</option>{HIGHLIGHT_COLORS.map((color) => <option key={color.key} value={color.key}>{color.label}</option>)}</select></label>
      <label>Revisão<select name="revisados" defaultValue={filter.reviewed ?? "all"}><option value="all">Todos</option><option value="pending">A revisar</option><option value="done">Revisados</option></select></label>
      <button className="button" type="submit">Filtrar</button>
    </form>
    <p className="notebook-summary"><span>{total} {total === 1 ? "trecho" : "trechos"}</span>{total > 0 && <a className="button primary" href={exportHref}>Exportar caderno (PDF)</a>}</p>
    {!total && <p className="empty">Nada por aqui ainda. Selecione um trecho no material e escolha uma cor para começar seu caderno.</p>}
    {groups.map((group) => <section key={group.discipline.slug} className="notebook-group">
      <h2>{group.discipline.title}</h2>
      {group.topics.map((topic) => <div key={topic.path.join(" › ")} className="notebook-topic"><h3>{topic.path.join(" › ")}</h3><ul>{topic.items.map((item) => <Item key={item.id} item={item} />)}</ul></div>)}
    </section>)}
  </div>;
}
