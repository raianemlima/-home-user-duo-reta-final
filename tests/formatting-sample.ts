import { PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib";

// PDF de teste: corpo na margem 54, negrito, itálico, verde, uma caixa colorida, um sublinhado, uma citação recuada
// e um cabeçalho (que fica de fora).
export async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const [regular, bold, italic] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold), pdf.embedFont(StandardFonts.HelveticaOblique)]);
  const ink = rgb(0.13, 0.16, 0.15);
  const write = (text: string, x: number, y: number, font = regular, color = ink) => { page.drawText(text, { x, y, size: 11, font, color }); return x + font.widthOfTextAtSize(text, 11); };
  write("EBOOK DE RETA FINAL", 54, 760);
  let x = write("A nacionalidade diz respeito ao ", 54, 640);
  x = write("vinculo juridico-politico", x, 640, bold);
  write(" entre pessoa e Estado.", x, 640);
  x = write("Pelo criterio ", 54, 620);
  x = write("jus soli", x, 620, italic);
  write(" vale o local do nascimento.", x, 620);
  write("Titulo em verde", 54, 600, bold, rgb(0.1, 0.48, 0.24));
  page.drawRectangle({ x: 50, y: 560, width: 500, height: 26, color: rgb(0.76, 0.99, 0.73) });
  write("DE OLHO NO EXAMINADOR: tema recorrente.", 60, 568, regular, rgb(0, 0, 0));
  x = write("Repare no ", 54, 540);
  const start = x;
  x = write("sistema tripartite", x, 540);
  page.drawRectangle({ x: start, y: 538, width: x - start, height: 0.8, color: ink });
  write(" da teoria do crime.", x, 540);
  write("E assegurado o direito a nacionalidade brasileira", 200, 510);
  write("originaria a pessoa nascida no exterior.", 200, 496);
  for (let i = 0; i < 6; i++) write(`Linha comum de corpo numero ${i + 1} para firmar a margem.`, 54, 470 - i * 16);
  return pdf.save();
}
