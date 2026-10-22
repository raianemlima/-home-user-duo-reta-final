"use client";

import Link from "next/link";
import type { Toc } from "@/lib/reader/queries";

export const sectionLabel = (item: { numbering: string | null; title: string | null }) => [item.numbering, item.title].filter(Boolean).join(" ") || "Introdução";

// Sumário: fixo à esquerda no PC, gaveta no celular.
export function TocDrawer({ slug, toc, currentId, open, onClose }: { slug: string; toc: Toc; currentId: string; open: boolean; onClose: () => void }) {
  return <>
    {open && <button className="drawer-backdrop" aria-label="Fechar sumário" onClick={onClose} />}
    <nav className={open ? "toc open" : "toc"} aria-label="Sumário da disciplina">
      <div className="toc-head"><strong>Sumário</strong><button className="icon-button toc-close" onClick={onClose} aria-label="Fechar sumário">✕</button></div>
      <ol>{toc.map((item) => <li key={item.id} style={{ paddingLeft: `${Math.max(0, item.level - 1) * 0.9}rem` }}>
        <Link href={`/disciplinas/${slug}/${item.id}`} aria-current={item.id === currentId ? "page" : undefined} className={item.id === currentId ? "current" : undefined} onClick={onClose}>{sectionLabel(item)}</Link>
      </li>)}</ol>
    </nav>
  </>;
}
