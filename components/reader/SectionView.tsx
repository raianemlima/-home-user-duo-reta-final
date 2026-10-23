"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { FontSize } from "@/components/reader/FontSize";
import { HighlightLayer } from "@/components/reader/HighlightLayer";
import { IntroBlock } from "@/components/reader/IntroBlock";
import { SearchBox } from "@/components/reader/SearchBox";
import { sectionLabel, TocDrawer } from "@/components/reader/TocDrawer";
import type { SectionView as View } from "@/lib/reader/queries";

const TOC_KEY = "duo:sumario-recolhido";
const tocListeners = new Set<() => void>();
const readTocHidden = () => { try { return window.localStorage.getItem(TOC_KEY) === "1"; } catch { return false; } };
const subscribeToc = (listener: () => void) => { tocListeners.add(listener); return () => { tocListeners.delete(listener); }; };
function saveTocHidden(hidden: boolean) {
  try { window.localStorage.setItem(TOC_KEY, hidden ? "1" : "0"); } catch { /* sem armazenamento: vale só nesta tela */ }
  tocListeners.forEach((listener) => listener());
}

export function SectionView({ view, children }: { view: View; children?: React.ReactNode }) {
  const [tocOpen, setTocOpen] = useState(false);
  // No computador o sumário pode ser recolhido para a leitura ficar limpa; a escolha vale para as próximas seções.
  const tocHidden = useSyncExternalStore(subscribeToc, readTocHidden, () => false);
  const slug = view.discipline.slug;
  // Página com várias seções curtas: chegando por uma seção do meio (sumário, busca), rola até o título dela.
  useEffect(() => {
    if (view.focusId !== view.section.id) document.getElementById(`s-${view.focusId}`)?.scrollIntoView({ block: "start" });
  }, [view.focusId, view.section.id]);
  const paragraphs = [...view.section.paragraphs, ...view.more.flatMap((section) => section.paragraphs)];
  const breaks = Object.fromEntries(view.more.filter((section) => section.paragraphs.length).map((section) => [section.paragraphs[0].id, { sectionId: section.id, label: sectionLabel(section) }]));
  useEffect(() => {
    void fetch("/api/leitura/posicao", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ disciplineId: view.discipline.id, sectionId: view.section.id }) }).catch(() => undefined);
  }, [view.discipline.id, view.section.id]);
  return <div className={tocHidden ? "reader toc-hidden" : "reader"}>
    <TocDrawer slug={slug} toc={view.toc} currentIds={view.pageIds} focusId={view.focusId} open={tocOpen} onClose={() => setTocOpen(false)} onCollapse={() => saveTocHidden(true)} />
    <article className="reader-main">
      <div className="reader-toolbar"><button className="button ghost toc-toggle" onClick={() => setTocOpen(true)}>☰ Sumário</button>{tocHidden && <button className="button ghost toc-show" onClick={() => saveTocHidden(false)} aria-label="Mostrar sumário">☰ Mostrar sumário</button>}{view.hasOriginal && <a className="button ghost" href={`/api/disciplinas/${slug}/original`} download>⬇ PDF original</a>}<FontSize /></div>
      <SearchBox slug={slug} />
      <header className="section-head">
        <p className="eyebrow"><Link href="/">Disciplinas</Link> › {view.discipline.title}{view.section.path.length ? ` › ${view.section.path.join(" › ")}` : ""}</p>
        <h1>{sectionLabel(view.section)}</h1>
        <p className="muted version-label">{view.versionLabel}</p>
      </header>
      <IntroBlock paragraphs={view.intro} />
      <HighlightLayer key={view.section.id} versionId={view.versionId} sectionId={view.section.id} paragraphs={paragraphs} breaks={breaks} />
      {children}
      <nav className="section-nav" aria-label="Navegação entre seções">
        {view.prevId ? <Link className="button" href={`/disciplinas/${slug}/${view.prevId}`}>← Anterior</Link> : <span />}
        {view.nextId ? <Link className="button primary" href={`/disciplinas/${slug}/${view.nextId}`}>Próxima →</Link> : <span />}
      </nav>
    </article>
  </div>;
}
