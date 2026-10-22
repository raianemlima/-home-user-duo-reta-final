import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";
import { listVade } from "@/lib/server/vade";
import { MAX_VADE_BYTES, VADE_BUCKET, vadeMaterial } from "@/lib/vade";

export const dynamic = "force-dynamic";

export function GET() {
  return handleRoute("equipe.vade.listar", async () => {
    const { supabase } = await requireStaff();
    return NextResponse.json({ materiais: await listVade(supabase) });
  });
}

// Prepara o envio do PDF direto do navegador para o armazenamento, substituindo o anterior.
export function POST(request: Request) {
  return handleRoute("equipe.vade.enviar", async () => {
    await requireStaff();
    const body = await readJson(request);
    if (typeof body.slug !== "string" || !vadeMaterial(body.slug)) throw new ApiError(400, "invalid_request", "Escolha a matéria do Vade Esperto.");
    if (typeof body.fileName !== "string" || !body.fileName.toLowerCase().endsWith(".pdf")) throw new ApiError(400, "invalid_request", "Envie o Vade Esperto em PDF.");
    if (typeof body.size !== "number" || body.size <= 0 || body.size > MAX_VADE_BYTES) throw new ApiError(400, "invalid_request", "O PDF precisa ter até 25 MB.");
    const { data, error } = await createAdminClient().storage.from(VADE_BUCKET).createSignedUploadUrl(`${body.slug}.pdf`, { upsert: true });
    if (error || !data) throw new Error(`Falha ao preparar o envio: ${error?.message ?? "sem retorno"}`);
    return NextResponse.json({ path: data.path, token: data.token });
  });
}

// Depois do envio: publica para os alunos, com a data de atualização que aparece na tela ("atualizado em 19.09.2026").
export function PUT(request: Request) {
  return handleRoute("equipe.vade.publicar", async () => {
    const { supabase } = await requireStaff();
    const body = await readJson(request);
    if (typeof body.slug !== "string" || !vadeMaterial(body.slug)) throw new ApiError(400, "invalid_request", "Escolha a matéria do Vade Esperto.");
    const versao = typeof body.versao === "string" ? body.versao.trim().slice(0, 80) : "";
    const { error } = await supabase.from("vade_esperto").upsert({ slug: body.slug, versao, updated_at: new Date().toISOString() }, { onConflict: "slug" });
    if (error) throw new Error(`Falha ao publicar: ${error.message}`);
    return NextResponse.json({ slug: body.slug, versao });
  });
}
