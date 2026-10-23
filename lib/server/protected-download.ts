import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/server/documents";
import { protectPdf } from "@/lib/server/protect-pdf";

// Entrega um PDF do curso já protegido para quem pediu (marca com o e-mail + criptografia sem cópia).
// O arquivo protegido fica numa pasta privada do aluno (um por material, substituído a cada download) e sai por URL
// assinada de vida curta: assim PDFs maiores que o limite de resposta do servidor também funcionam.
export async function deliverProtectedPdf(input: { bucket: string; path: string; fileName: string; key: string; user: { id: string; email?: string | null }; inline?: boolean }): Promise<NextResponse> {
  const admin = createAdminClient();
  const original = await admin.storage.from(input.bucket).download(input.path);
  if (original.error || !original.data) throw new Error(`Falha ao ler o PDF: ${original.error?.message ?? "vazio"}`);
  const bytes = await protectPdf(new Uint8Array(await original.data.arrayBuffer()), { email: input.user.email || `aluno ${input.user.id.slice(0, 8)}` });
  const target = `protegidos/${input.user.id}/${input.key.replace(/[^a-z0-9-]/gi, "-")}.pdf`;
  const upload = await admin.storage.from("documents").upload(target, bytes, { contentType: "application/pdf", upsert: true });
  if (upload.error) throw new Error(`Falha ao preparar o PDF protegido: ${upload.error.message}`);
  const signed = await admin.storage.from("documents").createSignedUrl(target, SIGNED_URL_TTL_SECONDS, input.inline ? undefined : { download: input.fileName });
  if (signed.error || !signed.data) throw new Error(`Falha ao assinar a URL: ${signed.error?.message ?? "resposta vazia"}`);
  return NextResponse.redirect(signed.data.signedUrl, 302);
}
