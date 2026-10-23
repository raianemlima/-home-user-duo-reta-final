import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute } from "@/lib/server/http";
import { isOfficialPlan, isPlanChoice, OFFICIAL_PLANS, STUDY_PLAN_BUCKET } from "@/lib/study-plan";
import { studyPlanFromDocx } from "@/lib/study-plan-view";
import { listVade } from "@/lib/server/vade";

export const dynamic = "force-dynamic";

// O cronograma escolhido, pronto para ler no app: dividido por dia da semana, com os links clicáveis.
// Arquivo próprio que não é Word (PDF, imagem, planilha) não dá para dividir: a tela oferece abrir o arquivo.
export function GET() {
  return handleRoute("cronograma.conteudo", async () => {
    const { supabase, user } = await requireStudent();
    const storage = createAdminClient().storage.from(STUDY_PLAN_BUCKET);
    const { data: choice, error: choiceError } = await supabase.from("study_plan_choices").select("plano").eq("user_id", user.id).maybeSingle();
    if (choiceError) throw new Error(`Falha ao ler a escolha de cronograma: ${choiceError.message}`);
    let plano = isPlanChoice(choice?.plano) ? choice.plano : null;
    let path: string | null = null; let titulo = "";
    if (isOfficialPlan(plano)) { path = OFFICIAL_PLANS[plano].path; titulo = OFFICIAL_PLANS[plano].label; }
    else {
      const { data, error } = await storage.list(user.id, { limit: 20 });
      if (error) throw new Error(`Falha ao ler o cronograma: ${error.message}`);
      const own = (data ?? []).find((item) => item.name && item.name !== ".emptyFolderPlaceholder");
      if (own) { plano = "proprio"; path = `${user.id}/${own.name}`; titulo = own.name; }
    }
    if (!path) throw new ApiError(404, "not_found", "Escolha um cronograma ou envie o seu.");
    if (!path.toLowerCase().endsWith(".docx")) return NextResponse.json({ plano, titulo, tipo: "arquivo" });
    const { data: blob, error } = await storage.download(path);
    if (error || !blob) throw new ApiError(404, "not_found", plano === "proprio" ? "Não foi possível abrir o seu cronograma." : "A equipe ainda não publicou este cronograma.");
    const [view, vade] = await Promise.all([studyPlanFromDocx(Buffer.from(await blob.arrayBuffer())), listVade(supabase)]);
    // Os Vade Espertos publicados: as atividades "Vade Esperto – X" ganham o botão para abrir o PDF.
    return NextResponse.json({ plano, titulo, tipo: "docx", ...view, vade: vade.filter((item) => item.disponivel || item.leitor).map((item) => item.slug), vadeLeitor: Object.fromEntries(vade.filter((item) => item.leitor).map((item) => [item.slug, item.leitor])) }, { headers: { "cache-control": "private, max-age=300" } });
  });
}
