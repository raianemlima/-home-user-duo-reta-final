import "server-only";
import { randomBytes } from "node:crypto";
import { degrees, PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib";

// PDF baixado pelo aluno: cada página leva a identificação de quem baixou (marca d'água e rodapé) e o aviso de
// proibição de reprodução; o arquivo sai criptografado (AES-256), abre sem senha, mas bloqueia copiar o texto e editar.
// A senha de dono é aleatória a cada download e não fica guardada: ninguém tira as restrições com ela.
export async function protectPdf(bytes: Uint8Array, viewer: { email: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const stamp = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  // Helvetica padrão só tem o alfabeto latino: o que sair dele vira "?" em vez de quebrar a geração.
  const safe = (text: string) => text.replace(/[^ -~ -ÿ]/g, "?");
  const owner = safe(viewer.email);
  const footer = safe(`Licenciado para ${viewer.email} em ${stamp} - Cursos DUO. Reprodução, compartilhamento e venda proibidos (Lei 9.610/98).`);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(5.5, Math.min(7, width / 85));
    page.drawText(footer, { x: 18, y: 8, size, font, color: rgb(0.35, 0.35, 0.35), opacity: 0.85, maxWidth: width - 36 });
    const mark = Math.min(width, height) / 18;
    page.drawText(owner, { x: width * 0.12, y: height * 0.3, size: mark, font, color: rgb(0.55, 0.55, 0.55), opacity: 0.12, rotate: degrees(35) });
  }
  pdf.encrypt({ ownerPassword: randomBytes(24).toString("base64url"), userPassword: "", permissions: { printing: "lowResolution", modifying: false, copying: false, annotating: true, fillingForms: false, contentAccessibility: true, documentAssembly: false } });
  return pdf.save({ useObjectStreams: false });
}
