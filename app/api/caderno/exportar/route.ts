import { NextResponse } from "next/server";
import { buildNotebookExport, countItems, MAX_EXPORT_ITEMS } from "@/lib/export/model";
import { renderPdf } from "@/lib/export/pdf";
import { parseNotebookFilter } from "@/lib/notebook/filters";
import { loadNotebook } from "@/lib/notebook/queries";
import { requireStudent } from "@/lib/server/auth";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { ApiError, handleRoute } from "@/lib/server/http";
import { protectPdf } from "@/lib/server/protect-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return handleRoute("caderno.exportar", async () => {
    const { supabase, user } = await requireStudent();
    const params = new URL(request.url).searchParams;
    const notebook = await loadNotebook(supabase, user.id, parseNotebookFilter(params));
    const total = countItems(notebook);
    if (!total) throw new ApiError(404, "empty", "Não há trechos no caderno com esses filtros.");
    if (total > MAX_EXPORT_ITEMS) throw new ApiError(413, "too_large", "Seu caderno ficou grande demais para um arquivo só. Filtre por disciplina e exporte em partes.");
    await enforceRateLimit(supabase, "export");
    const now = new Date();
    const model = buildNotebookExport(notebook, user.email ?? "aluno", now);
    // Só PDF: o caderno leva trechos do material e sai com a mesma proteção dos ebooks (e-mail do aluno em cada página,
    // sem cópia). O Word não aceita essa proteção, por isso não é oferecido.
    const bytes = await protectPdf(await renderPdf(model), { email: user.email || `aluno ${user.id.slice(0, 8)}` });
    const day = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return new NextResponse(bytes as unknown as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="caderno-duo-${day}.pdf"`, "cache-control": "private, no-store" } });
  });
}
