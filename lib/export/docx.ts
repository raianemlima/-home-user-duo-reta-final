import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageBreak, PageNumber, Paragraph, TextRun } from "docx";
import type { ExportDoc } from "@/lib/export/model";
import { HIGHLIGHT_COLORS } from "@/lib/highlights/types";

// Mesmo modelo do PDF, em Word: Arial como nos e-books, títulos em verde-floresta, cada trecho com a barra da cor do grifo.
const FONT = "Arial", INK = "231F1E", MUTED = "4C5F54", BRAND = "17401F";
const hex = (color: string) => (HIGHLIGHT_COLORS.find((item) => item.key === color)?.swatch ?? "#DDDDDD").replace("#", "");
// Word não aceita caracteres de controle no XML; o resto (inclusive emoji) passa.
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const text = (value: string, options: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) => new TextRun({ text: clean(value), font: FONT, size: options.size ?? 21, color: options.color ?? INK, bold: options.bold, italics: options.italics });

export async function renderDocx(doc: ExportDoc): Promise<Uint8Array> {
  const cover = [
    new Paragraph({ spacing: { after: 120 }, children: [text("CURSOS DUO", { bold: true, size: 26, color: BRAND })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [text(doc.title, { bold: true, size: 56 })] }),
    new Paragraph({ spacing: { after: 360 }, children: [text(`${doc.subtitle} · gerado em ${doc.generatedAt}`, { size: 28, color: MUTED })] }),
    new Paragraph({ spacing: { after: 120 }, children: [text("Sumário", { bold: true, size: 28 })] }),
    ...doc.disciplines.map((discipline) => new Paragraph({ children: [text(`${discipline.title} — ${discipline.topics.reduce((sum, topic) => sum + topic.items.length, 0)} trecho(s)`)] })),
  ];
  const body = doc.disciplines.flatMap((discipline) => [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 200 }, children: [text(discipline.title, { bold: true, size: 34, color: BRAND })] }),
    ...discipline.topics.flatMap((topic) => [
      new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 240, after: 120 }, children: [text(topic.heading, { bold: true, size: 22, color: MUTED })] }),
      ...topic.items.flatMap((item) => {
        const bar = { left: { style: BorderStyle.SINGLE, size: 24, color: hex(item.color), space: 8 } };
        const lines = [
          // Sem linha de referência (cor · disciplina › seção): a seção já está no título acima; fica só o texto, justificado.
          new Paragraph({ border: bar, keepNext: Boolean(item.note || item.orphanedNotice), alignment: AlignmentType.JUSTIFIED, indent: { left: 160 }, spacing: { before: 120, after: item.note || item.orphanedNotice ? 0 : 160, line: 300 }, children: [text(item.quote, { size: 22 })] }),
          ...(item.note ? [new Paragraph({ border: bar, keepNext: Boolean(item.orphanedNotice), alignment: AlignmentType.JUSTIFIED, indent: { left: 160 }, spacing: { before: 60, after: item.orphanedNotice ? 0 : 160 }, children: [text(item.note, { italics: true, color: MUTED })] })] : []),
          ...(item.orphanedNotice ? [new Paragraph({ border: bar, indent: { left: 160 }, spacing: { after: 160 }, children: [text(item.orphanedNotice, { size: 17, color: MUTED })] })] : []),
        ];
        return lines;
      }),
    ]),
  ]);
  const document = new Document({
    creator: "Cursos DUO", title: `${doc.title} · ${doc.subtitle}`, description: doc.footer,
    styles: { default: { document: { run: { font: FONT, size: 21, color: INK } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [text(`${doc.footer} · `, { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })] }) },
      children: [...cover, ...body],
    }],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}
