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

export function paragraphFormat(text: string, kind: string): ParagraphFormat {
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
