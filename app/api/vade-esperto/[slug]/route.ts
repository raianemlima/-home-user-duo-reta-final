import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStudent } from "@/lib/server/auth";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/server/documents";
import { ApiError, handleRoute } from "@/lib/server/http";
import { VADE_BUCKET, vadeMaterial } from "@/lib/vade";

export const dynamic = "force-dynamic";

// Abre o PDF do Vade Esperto por URL assinada de vida curta; com ?baixar=1, baixa o arquivo.
export function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handleRoute("vade.abrir", async () => {
    const { supabase } = await requireStudent();
    const { slug } = await context.params;
    const material = vadeMaterial(slug);
    if (!material) throw new ApiError(404, "not_found", "Vade Esperto não encontrado.");
    const { data, error } = await supabase.from("vade_esperto").select("slug").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`Falha ao ler o Vade Esperto: ${error.message}`);
    if (!data) throw new ApiError(404, "not_found", "Este Vade Esperto ainda não foi publicado.");
    const download = new URL(request.url).searchParams.has("baixar") ? `Vade Esperto - ${material.titulo}.pdf` : undefined;
    const signed = await createAdminClient().storage.from(VADE_BUCKET).createSignedUrl(`${slug}.pdf`, SIGNED_URL_TTL_SECONDS, download ? { download } : undefined);
    if (signed.error || !signed.data) throw new Error(`Falha ao assinar a URL: ${signed.error?.message ?? "resposta vazia"}`);
    return NextResponse.redirect(signed.data.signedUrl, 302);
  });
}
