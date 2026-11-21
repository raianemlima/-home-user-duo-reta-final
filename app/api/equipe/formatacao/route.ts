import { NextResponse } from "next/server";
import { applyFormatting, FormattingUnavailable } from "@/lib/formatting/apply";
import { requireStaff } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Aplica (ou reaplica) a formatação do PDF original numa versão já criada: negrito, itálico, cores, recuos e caixas.
export function POST(request: Request) {
  return handleRoute("equipe.formatacao", async () => {
    const { supabase } = await requireStaff();
    const body = await readJson(request);
    const versionId = typeof body.versionId === "string" && UUID_PATTERN.test(body.versionId) ? body.versionId : null;
    if (!versionId) throw new ApiError(400, "invalid_request", "Versão inválida.");
    try { return NextResponse.json(await applyFormatting(supabase, versionId)); }
    catch (error) { if (error instanceof FormattingUnavailable) throw new ApiError(503, "unavailable", error.message); throw error; }
  });
}
