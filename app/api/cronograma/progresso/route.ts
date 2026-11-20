import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";
import { daysBetween, isIsoDate, MAX_ACTIVITY_TITLE, MAX_RANGE_DAYS } from "@/lib/study-progress";

export const dynamic = "force-dynamic";

// Tabela ainda não criada (migração 0021 não aplicada): a tela esconde a marcação em vez de dar erro.
const missingTable = (error: { code?: string; message?: string }) => error.code === "42P01" || error.code === "PGRST205" || (/study_activity_done/.test(error.message ?? "") && /(does not exist|could not find)/i.test(error.message ?? ""));

// As atividades que o aluno concluiu entre duas datas (a semana que a tela mostra).
export function GET(request: Request) {
  return handleRoute("cronograma.progresso", async () => {
    const { supabase, user } = await requireStudent();
    const params = new URL(request.url).searchParams;
    const de = params.get("de"); const ate = params.get("ate");
    if (!isIsoDate(de) || !isIsoDate(ate) || daysBetween(de, ate) < 0 || daysBetween(de, ate) > MAX_RANGE_DAYS) throw new ApiError(400, "invalid_request", "Período inválido.");
    const { data, error } = await supabase.from("study_activity_done").select("dia, atividade").eq("user_id", user.id).gte("dia", de).lte("dia", ate);
    if (error) {
      if (missingTable(error)) return NextResponse.json({ disponivel: false, feitas: [] });
      throw new Error(`Falha ao ler as atividades concluídas: ${error.message}`);
    }
    return NextResponse.json({ disponivel: true, feitas: (data ?? []).map((row) => ({ dia: row.dia as string, atividade: row.atividade as string })) }, { headers: { "cache-control": "private, no-store" } });
  });
}

// Marca ou desmarca uma atividade como concluída num dia.
export function PUT(request: Request) {
  return handleRoute("cronograma.progresso.marcar", async () => {
    const { supabase, user } = await requireStudent();
    const body = await readJson(request);
    const atividade = typeof body.atividade === "string" ? body.atividade.trim() : "";
    if (!isIsoDate(body.dia)) throw new ApiError(400, "invalid_request", "Data inválida.");
    if (!atividade || atividade.length > MAX_ACTIVITY_TITLE) throw new ApiError(400, "invalid_request", "Atividade inválida.");
    if (typeof body.concluida !== "boolean") throw new ApiError(400, "invalid_request", "Informe se a atividade foi concluída.");
    const { error } = body.concluida
      ? await supabase.from("study_activity_done").upsert({ user_id: user.id, dia: body.dia, atividade, done_at: new Date().toISOString() }, { onConflict: "user_id,dia,atividade" })
      : await supabase.from("study_activity_done").delete().eq("user_id", user.id).eq("dia", body.dia).eq("atividade", atividade);
    if (error) {
      if (missingTable(error)) throw new ApiError(503, "unavailable", "A marcação de atividades ainda não está disponível.");
      throw new Error(`Falha ao salvar a atividade: ${error.message}`);
    }
    return NextResponse.json({ dia: body.dia, atividade, concluida: body.concluida });
  });
}
