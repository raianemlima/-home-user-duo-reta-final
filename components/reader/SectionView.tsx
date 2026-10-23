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
// Seção de artigo: nasce do próprio parágrafo do artigo ("Art. 1.196. Considera-se…", "Artigo 2º – …"), que já mostra o número.
const isArticleSection = (section: { numbering: string | null; paragraphs: { text: string }[] }) => Boolean(section.numbering && /^Art\./.test(section.numbering) && /^Art(?:igos?)?\.?\s*\d/i.test(section.paragraphs[0]?.text ?? ""));
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
  // Títulos das seções seguintes da página; título sem texto próprio ("TÍTULO IV", "CAPÍTULO I") vai junto do próximo.
  // Artigo de lei: o próprio texto já começa com "Art. 5º" — no meio da página fica só a âncora do sumário, sem repetir.
  const breaks: Record<string, { sectionId: string; label: string; hidden?: boolean }[]> = {};
  let pending: { sectionId: string; label: string; hidden?: boolean }[] = [];
  for (const section of view.more) {
    pending.push({ sectionId: section.id, label: sectionLabel(section), hidden: isArticleSection(section) });
    if (section.paragraphs.length) { breaks[section.paragraphs[0].id] = pending; pending = []; }
  }
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
      {pending.map((subhead) => subhead.hidden ? <span key={subhead.sectionId} className="section-anchor" id={`s-${subhead.sectionId}`} /> : <h2 key={subhead.sectionId} className="section-subhead" id={`s-${subhead.sectionId}`}>{subhead.label}</h2>)}
      {children}
      <nav className="section-nav" aria-label="Navegação entre seções">
        {view.prevId ? <Link className="button" href={`/disciplinas/${slug}/${view.prevId}`}>← Anterior</Link> : <span />}
        {view.nextId ? <Link className="button primary" href={`/disciplinas/${slug}/${view.nextId}`}>Próxima →</Link> : <span />}
      </nav>
    </article>
  </div>;
}
