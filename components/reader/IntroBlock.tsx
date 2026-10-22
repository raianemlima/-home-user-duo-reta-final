import { Fragment } from "react";
import { markLead, paragraphFormat, tipRoles } from "@/lib/reader/format";
import type { ReaderParagraph } from "@/lib/reader/queries";

const LONG_INTRO = 4;

// Texto de abertura do documento, no topo da primeira seção (não é mais uma página "Introdução" à parte).
// Uma linha curta é o nome do capítulo ("Dos Princípios Fundamentais"); uma abertura longa fica recolhida.
export function IntroBlock({ paragraphs }: { paragraphs: ReaderParagraph[] }) {
  if (!paragraphs.length) return null;
  if (paragraphs.length === 1 && paragraphs[0].kind === "body" && paragraphs[0].text.length <= 120) return <p className="section-intro-title">{paragraphs[0].text}</p>;
  const tips = tipRoles(paragraphs);
  const body = <div className="section-text section-intro">{paragraphs.map((paragraph) => {
    const format = paragraphFormat(paragraph.text, paragraph.kind);
    return <p key={paragraph.id} className={`paragraph paragraph-${paragraph.kind} ${format.className} ${tips.get(paragraph.id) ?? ""}`.trim()}>
      {markLead([{ text: paragraph.text }], format.lead).map((segment, index) => <Fragment key={index}>{segment.lead ? <span className="lead">{segment.text}</span> : segment.text}</Fragment>)}
    </p>;
  })}</div>;
  return paragraphs.length > LONG_INTRO ? <details className="section-intro-more"><summary>Apresentação do material</summary>{body}</details> : body;
}
