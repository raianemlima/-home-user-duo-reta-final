import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const MAX_FIELD = 1000;

const text = (value: unknown) => (typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD ? value : null);

// Guarda o aparelho do aluno para os avisos de material novo. Reinscrever o mesmo aparelho só atualiza as chaves.
export function POST(request: Request) {
  return handleRoute("notificacoes.inscrever", async () => {
    const { user } = await requireStudent();
    const body = await readJson(request);
    const keys = (body.keys ?? {}) as Record<string, unknown>;
    const endpoint = text(body.endpoint), p256dh = text(keys.p256dh), auth = text(keys.auth);
    if (!endpoint || !p256dh || !auth || !endpoint.startsWith("https://")) throw new ApiError(400, "invalid_request", "Inscrição de avisos inválida.");
    // Aparelho compartilhado: a inscrição pode já pertencer a outro aluno, que a RLS não deixa alterar. Com a chave de
    // serviço (depois de conferir a sessão), o aparelho passa a avisar só quem está logado agora.
    const { error } = await createAdminClient().from("push_subscriptions").upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });
    if (error) throw new Error(`Falha ao salvar a inscrição: ${error.message}`);
    return NextResponse.json({ subscribed: true }, { status: 201 });
  });
}

export function DELETE(request: Request) {
  return handleRoute("notificacoes.cancelar", async () => {
    const { supabase, user } = await requireStudent();
    const body = await readJson(request);
    const endpoint = text(body.endpoint);
    if (!endpoint) throw new ApiError(400, "invalid_request", "Inscrição de avisos inválida.");
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
    if (error) throw new Error(`Falha ao remover a inscrição: ${error.message}`);
    return NextResponse.json({ subscribed: false });
  });
}
