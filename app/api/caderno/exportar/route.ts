import { NextResponse } from "next/server";
import { buildNotebookExport, countItems, MAX_EXPORT_ITEMS } from "@/lib/export/model";
import { renderDocx } from "@/lib/export/docx";
import { renderPdf } from "@/lib/export/pdf";
import { parseNotebookFilter } from "@/lib/notebook/filters";
import { loadNotebook } from "@/lib/notebook/queries";
import { requireStudent } from "@/lib/server/auth";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { ApiError, handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return handleRoute("caderno.exportar", async () => {
    const { supabase, user } = await requireStudent();
    const params = new URL(request.url).searchParams;
    const docx = params.get("formato") === "docx";
    const notebook = await loadNotebook(supabase, user.id, parseNotebookFilter(params));
    const total = countItems(notebook);
    if (!total) throw new ApiError(404, "empty", "Não há trechos no caderno com esses filtros.");
    if (total > MAX_EXPORT_ITEMS) throw new ApiError(413, "too_large", "Seu caderno ficou grande demais para um arquivo só. Filtre por disciplina e exporte em partes.");
    await enforceRateLimit(supabase, "export");
    const now = new Date();
    const model = buildNotebookExport(notebook, user.email ?? "aluno", now);
    const bytes = docx ? await renderDocx(model) : await renderPdf(model);
    const day = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const type = docx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf";
    return new NextResponse(bytes as unknown as BodyInit, { headers: { "content-type": type, "content-disposition": `attachment; filename="caderno-duo-${day}.${docx ? "docx" : "pdf"}"`, "cache-control": "private, no-store" } });
  });
}
