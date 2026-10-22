"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FontSize } from "@/components/reader/FontSize";
import { HighlightLayer } from "@/components/reader/HighlightLayer";
import { SearchBox } from "@/components/reader/SearchBox";
import { sectionLabel, TocDrawer } from "@/components/reader/TocDrawer";
import type { SectionView as View } from "@/lib/reader/queries";

export function SectionView({ view, children }: { view: View; children?: React.ReactNode }) {
  const [tocOpen, setTocOpen] = useState(false);
  const slug = view.discipline.slug;
  useEffect(() => {
    void fetch("/api/leitura/posicao", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ disciplineId: view.discipline.id, sectionId: view.section.id }) }).catch(() => undefined);
  }, [view.discipline.id, view.section.id]);
  return <div className="reader">
    <TocDrawer slug={slug} toc={view.toc} currentId={view.section.id} open={tocOpen} onClose={() => setTocOpen(false)} />
    <article className="reader-main">
      <div className="reader-toolbar"><button className="button ghost toc-toggle" onClick={() => setTocOpen(true)}>☰ Sumário</button><FontSize /></div>
      <SearchBox slug={slug} />
      <header className="section-head">
        <p className="eyebrow"><Link href="/">Disciplinas</Link> › {view.discipline.title}{view.section.path.length ? ` › ${view.section.path.join(" › ")}` : ""}</p>
        <h1>{sectionLabel(view.section)}</h1>
        <p className="muted version-label">{view.versionLabel}</p>
      </header>
      <HighlightLayer key={view.section.id} versionId={view.versionId} sectionId={view.section.id} paragraphs={view.section.paragraphs} />
      {children}
      <nav className="section-nav" aria-label="Navegação entre seções">
        {view.prevId ? <Link className="button" href={`/disciplinas/${slug}/${view.prevId}`}>← Anterior</Link> : <span />}
        {view.nextId ? <Link className="button primary" href={`/disciplinas/${slug}/${view.nextId}`}>Próxima →</Link> : <span />}
      </nav>
    </article>
  </div>;
}
