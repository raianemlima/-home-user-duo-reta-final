"use client";

import Link from "next/link";
import { useMemo } from "react";
import { chapterBreaks, type Toc } from "@/lib/reader/queries";

export const sectionLabel = (item: { numbering: string | null; title: string | null }) => [...new Set([item.numbering, item.title].filter(Boolean))].join(" ") || "Introdução";

// Sumário: fixo à esquerda no PC (com botão para recolher), gaveta no celular.
export function TocDrawer({ slug, toc, currentId, open, onClose, onCollapse }: { slug: string; toc: Toc; currentId: string; open: boolean; onClose: () => void; onCollapse: () => void }) {
  const chapters = chapterBreaks(toc);
  // Recuo pela posição do nível entre os níveis usados (artigos vêm com nível 9): no máximo 3 degraus.
  const depth = useMemo(() => { const levels = [...new Set(toc.map((item) => item.level))].sort((a, b) => a - b); return new Map(levels.map((level, index) => [level, Math.min(index, 3)])); }, [toc]);
  return <>
    {open && <button className="drawer-backdrop" aria-label="Fechar sumário" onClick={onClose} />}
    <nav className={open ? "toc open" : "toc"} aria-label="Sumário da disciplina">
      <div className="toc-head"><strong>Sumário</strong><button className="icon-button toc-collapse" onClick={onCollapse} aria-label="Recolher sumário" title="Recolher sumário">«</button><button className="icon-button toc-close" onClick={onClose} aria-label="Fechar sumário">✕</button></div>
      <ol>{toc.map((item) => <li key={item.id} style={{ paddingLeft: `${(depth.get(item.level) ?? 0) * 0.9}rem` }}>
        {chapters.has(item.id) && <span className="toc-chapter">{chapters.get(item.id)}</span>}
        <Link href={`/disciplinas/${slug}/${item.id}`} aria-current={item.id === currentId ? "page" : undefined} className={item.id === currentId ? "current" : undefined} onClick={onClose}>{sectionLabel(item)}</Link>
      </li>)}</ol>
    </nav>
  </>;
}
