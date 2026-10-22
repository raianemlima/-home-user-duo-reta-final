import { NextResponse } from "next/server";
import { buildNotebookExport, countItems, MAX_EXPORT_ITEMS } from "@/lib/export/model";
import { renderPdf } from "@/lib/export/pdf";
import { parseNotebookFilter } from "@/lib/notebook/filters";
import { loadNotebook } from "@/lib/notebook/queries";
import { requireStudent } from "@/lib/server/auth";
import { ApiError, handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return handleRoute("caderno.exportar", async () => {
    const { supabase, user } = await requireStudent();
    const notebook = await loadNotebook(supabase, user.id, parseNotebookFilter(new URL(request.url).searchParams));
    const total = countItems(notebook);
    if (!total) throw new ApiError(404, "empty", "Não há trechos no caderno com esses filtros.");
    if (total > MAX_EXPORT_ITEMS) throw new ApiError(413, "too_large", "Seu caderno ficou grande demais para um arquivo só. Filtre por disciplina e exporte em partes.");
    const now = new Date();
    const bytes = await renderPdf(buildNotebookExport(notebook, user.email ?? "aluno", now));
    const day = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return new NextResponse(bytes as unknown as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="caderno-duo-${day}.pdf"`, "cache-control": "private, no-store" } });
  });
}
