// Formatação de texto jurídico no leitor: só classes e destaque do rótulo ("Art. 5º", "§ 1º", "I -"). O texto nunca muda,
// então os deslocamentos dos grifos continuam valendo.
export type ParagraphFormat = { className: string; lead: number };

const RULES: { pattern: RegExp; className: string }[] = [
  { pattern: /^Art(?:igos?)?\.?\s*\d+(?:\.\d+)*\s*[º°o]?(?:-[A-Z])?(?:\s*[-–—.])?/iu, className: "para-article" },
  { pattern: /^(?:§\s*\d+\s*[º°o]?|Par[áa]grafo\s+[úu]nico)(?:\s*[-–—.:])?/iu, className: "para-par" },
  { pattern: /^[IVXLC]{1,6}\s*(?:[-–—)]|\.\s)/u, className: "para-inciso" },
  { pattern: /^[a-z]\)/u, className: "para-alinea" },
  { pattern: /^\d{1,2}[.)]\s+(?=\p{L})/u, className: "para-item" },
];

const TIP_LEAD = /^DICA DUO\b:?/;

export function paragraphFormat(text: string, kind: string): ParagraphFormat {
  if (kind === "tip") return { className: "", lead: TIP_LEAD.exec(text)?.[0].length ?? 0 };
  if (kind !== "body") return { className: "", lead: 0 };
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match) return { className: rule.className, lead: match[0].length };
  }
  return { className: "", lead: 0 };
}

export type LeadSegment<T extends { text: string }> = T & { lead: boolean };

// Marca os trechos que estão dentro do rótulo; o trecho que atravessa o limite é cortado em dois.
export function markLead<T extends { text: string }>(segments: T[], lead: number): LeadSegment<T>[] {
  const out: LeadSegment<T>[] = [];
  let offset = 0;
  for (const segment of segments) {
    const end = offset + segment.text.length;
    if (lead <= offset) out.push({ ...segment, lead: false });
    else if (end <= lead) out.push({ ...segment, lead: true });
    else { out.push({ ...segment, text: segment.text.slice(0, lead - offset), lead: true }, { ...segment, text: segment.text.slice(lead - offset), lead: false }); }
    offset = end;
  }
  return out;
}

// Caixa "DICA DUO": quando o parágrafo da dica é só o título ("DICA DUO Como usar este material"), o texto da dica vem
// no parágrafo seguinte. Os dois são desenhados como uma caixa só (título + corpo); o texto não muda.
export function tipRoles(paragraphs: { id: string; kind: string; text: string }[]): Map<string, "tip-head" | "tip-text"> {
  const roles = new Map<string, "tip-head" | "tip-text">();
  paragraphs.forEach((paragraph, index) => {
    const next = paragraphs[index + 1];
    if (paragraph.kind === "tip" && paragraph.text.length <= 90 && !/[.!?]$/.test(paragraph.text) && next?.kind === "body") {
      roles.set(paragraph.id, "tip-head");
      roles.set(next.id, "tip-text");
    }
  });
  return roles;
}
