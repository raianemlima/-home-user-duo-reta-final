import "server-only";
import render from "dom-serializer";
import { findAll, textContent } from "domutils";
import { type ChildNode, type Element, Text } from "domhandler";
import { parseDocument } from "htmlparser2";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";

// Cronograma em Word lido dentro do app: vira HTML limpo (só formatação, tabelas e links http/https) e é
// dividido por dia da semana, para o aluno ver de cara o que estudar hoje.
// Cada atividade do dia vem de uma tabela "ATIVIDADE n | TEMPO" do Word, com os links que aparecem até a próxima.
export type StudyPlanLink = { href: string; rotulo: string };
export type StudyPlanActivity = { titulo: string; tempo: string; links: StudyPlanLink[] };
export type StudyPlanDay = { dia: number; titulo: string; html: string; atividades?: StudyPlanActivity[] };
// Depois dos dias, o cronograma traz material de apoio (ex.: "TRILHAS INTELIGENTES", uma trilha por disciplina).
export type StudyPlanAnnex = { titulo: string; html: string };
export type StudyPlanView = { geral: string; dias: StudyPlanDay[]; anexos: StudyPlanAnnex[] };

// 0 = domingo … 6 = sábado, como Date.getDay().
const WEEKDAYS: [RegExp, number][] = [
  [/^domingo$/, 0], [/^segunda(-?feira)?$/, 1], [/^terca(-?feira)?$/, 2], [/^quarta(-?feira)?$/, 3],
  [/^quinta(-?feira)?$/, 4], [/^sexta(-?feira)?$/, 5], [/^sabado$/, 6],
];
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s:–—]+/g, " ").trim().replace(/ /g, "-");

// Um bloco é título de dia quando o texto dele é o nome do dia ("SEGUNDA FEIRA", "Terça-feira"), sozinho ou
// seguido de um rótulo curto depois de "·" ou travessão ("DOMINGO · SIMULADO").
export function weekdayOf(text: string): number | null {
  const [head, ...rest] = text.split(/[·•|–—]/);
  if (rest.join("").trim().length > 30) return null;
  const key = fold(head);
  if (!key || key.length > 14) return null;
  return WEEKDAYS.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "strong", "b", "em", "i", "u", "s", "sup", "sub", "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "th", "td", "blockquote"],
  allowedAttributes: { a: ["href", "target", "rel"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
  allowedSchemes: ["http", "https", "mailto"],
  // Todo link abre fora do app, sem dar ao site de destino acesso à página do aluno.
  transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" } }) },
  exclusiveFilter: (frame) => frame.tag === "a" && !frame.attribs.href,
};

// Link cujo texto é o próprio endereço vira um rótulo curto com o site ("qconcursos.com").
const hostOf = (href: string) => { try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return href; } };
const looksLikeUrl = (text: string) => /^(https?:\/\/|www\.)\S+$/i.test(text.trim());

export function activitiesOf(html: string): StudyPlanActivity[] {
  const activities: StudyPlanActivity[] = [];
  for (const node of parseDocument(html).children) {
    const cells = node.type === "tag" && (node as Element).name === "table" ? findAll((item) => item.name === "td" || item.name === "th", [node]) : [];
    const first = cells[0] ? textContent(cells[0]).replace(/\s+/g, " ").trim() : "";
    const match = /^atividade\s*\d+\s*/i.exec(first);
    if (match) {
      activities.push({ titulo: first.slice(match[0].length).trim(), tempo: cells[1] ? textContent(cells[1]).replace(/^\s*tempo\s*/i, "").replace(/\s+/g, " ").trim() : "", links: [] });
      continue;
    }
    const current = activities.at(-1);
    if (!current) continue;
    for (const anchor of findAll((item) => item.name === "a" && Boolean(item.attribs.href), [node])) {
      const href = anchor.attribs.href; const text = textContent(anchor).replace(/\s+/g, " ").trim();
      if (current.links.some((link) => link.href === href)) continue;
      const label = !text || looksLikeUrl(text) || text.endsWith("↗") ? hostOf(href) : text.replace(/\s*→\s*$/, "");
      const repeated = current.links.filter((link) => link.rotulo === label || link.rotulo.startsWith(`${label} (`)).length;
      current.links.push({ href, rotulo: repeated ? `${label} (${repeated + 1})` : label });
    }
  }
  return activities;
}

const isHeading = (node: ChildNode, levels: string[]) => node.type === "tag" && levels.includes((node as Element).name);

// Separa o documento em "geral" (orientações e visão da semana), um trecho por dia da semana e, depois dos dias,
// os anexos: um título de nível 1 encerra os dias, e cada título de nível 1 ou 2 seguinte abre um anexo.
export function splitByWeekday(html: string): StudyPlanView {
  const document = parseDocument(html);
  const general: string[] = []; const days: StudyPlanDay[] = []; const annexes: StudyPlanAnnex[] = [];
  let current: { html: string; titulo?: string } | null = null; let inAnnexes = false;
  for (const node of document.children) {
    const text = textContent(node).trim();
    const day = inAnnexes ? null : weekdayOf(text);
    if (day !== null) {
      const existing = days.find((item) => item.dia === day);
      current = existing ?? { dia: day, titulo: text, html: "" };
      if (!existing) days.push(current as StudyPlanDay);
      continue;
    }
    if (days.length && isHeading(node, inAnnexes ? ["h1", "h2"] : ["h1"])) {
      inAnnexes = true;
      if (!text) continue; // título vazio no Word: ignora
      current = { titulo: text.replace(/[\s[(]+$/, ""), html: "" }; annexes.push(current as StudyPlanAnnex);
      continue;
    }
    const piece = render(node, { encodeEntities: "utf8" });
    if (current) current.html += piece; else general.push(piece);
  }
  return { geral: general.join(""), dias: days, anexos: annexes };
}

// Endereço enorme como texto do link quebra a leitura no celular: o link passa a mostrar só o site.
function shortenUrlLinks(html: string): string {
  const document = parseDocument(html);
  for (const anchor of findAll((item) => item.name === "a", document.children)) {
    const text = textContent(anchor).trim();
    if (looksLikeUrl(text)) anchor.children = [new Text(`${hostOf(anchor.attribs.href ?? text)} ↗`)];
  }
  return render(document, { encodeEntities: "utf8" });
}

export async function studyPlanFromDocx(buffer: Buffer): Promise<StudyPlanView> {
  const { value } = await mammoth.convertToHtml({ buffer }, { ignoreEmptyParagraphs: true });
  const view = splitByWeekday(shortenUrlLinks(sanitizeHtml(value, SANITIZE)));
  // Segunda passada só para garantir que a divisão não produziu nada fora da lista permitida.
  const clean = <T extends { html: string }>(item: T): T => ({ ...item, html: sanitizeHtml(item.html, SANITIZE) });
  return { geral: sanitizeHtml(view.geral, SANITIZE), dias: view.dias.map(clean).map((day) => ({ ...day, atividades: activitiesOf(day.html) })), anexos: view.anexos.map(clean).filter((annex) => annex.html.trim()) };
}
