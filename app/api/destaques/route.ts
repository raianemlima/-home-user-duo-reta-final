import { NextResponse } from "next/server";
import { AnchorError, createAnchor } from "@/lib/highlights/anchor";
import { HIGHLIGHT_COLUMNS, sectionTextOf, toHighlightView } from "@/lib/highlights/server";
import { isHighlightColor, type Point } from "@/lib/highlights/types";
import { requireStudent } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const MAX_NOTE = 2000;

const point = (value: unknown): Point | null => {
  const candidate = value as Partial<Point> | null;
  return candidate && typeof candidate.paragraphId === "string" && UUID_PATTERN.test(candidate.paragraphId) && Number.isInteger(candidate.offset) && (candidate.offset as number) >= 0 ? { paragraphId: candidate.paragraphId, offset: candidate.offset as number } : null;
};

export function GET(request: Request) {
  return handleRoute("destaques.listar", async () => {
    const { supabase, user } = await requireStudent();
    const versionId = new URL(request.url).searchParams.get("versao") ?? "";
    if (!UUID_PATTERN.test(versionId)) throw new ApiError(400, "invalid_request", "Versão inválida.");
    const { data, error } = await supabase.from("highlights").select(HIGHLIGHT_COLUMNS).eq("user_id", user.id).eq("version_id", versionId).eq("status", "active");
    if (error) throw new Error(`Falha ao listar grifos: ${error.message}`);
    return NextResponse.json({ highlights: (data ?? []).map(toHighlightView) });
  });
}

// O trecho, o contexto e a disciplina são calculados no servidor a partir do texto publicado: o cliente só envia posições.
export function POST(request: Request) {
  return handleRoute("destaques.criar", async () => {
    const { supabase, user } = await requireStudent();
    const body = await readJson(request);
    const versionId = typeof body.versionId === "string" && UUID_PATTERN.test(body.versionId) ? body.versionId : null;
    const start = point(body.start), end = point(body.end);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!versionId || !start || !end) throw new ApiError(400, "invalid_request", "Seleção inválida.");
    if (!isHighlightColor(body.color)) throw new ApiError(400, "invalid_request", "Cor de grifo inválida.");
    if (note.length > MAX_NOTE) throw new ApiError(400, "invalid_request", `A anotação pode ter até ${MAX_NOTE} caracteres.`);
    const section = await sectionTextOf(supabase, versionId, start.paragraphId);
    if (!section) throw new ApiError(400, "invalid_request", "Este trecho não está no material publicado.");
    let anchor;
    try { anchor = createAnchor(section.doc, start, end); } catch (error) { if (error instanceof AnchorError) throw new ApiError(400, "invalid_request", error.message); throw error; }
    const { data, error } = await supabase.from("highlights").insert({ user_id: user.id, discipline_id: section.disciplineId, version_id: versionId, start_paragraph_id: anchor.start.paragraphId, start_offset: anchor.start.offset, end_paragraph_id: anchor.end.paragraphId, end_offset: anchor.end.offset, quote: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix, color: body.color, note: note || null }).select(HIGHLIGHT_COLUMNS).single();
    if (error || !data) throw new Error(`Falha ao salvar o grifo: ${error?.message ?? "sem retorno"}`);
    return NextResponse.json({ highlight: toHighlightView(data) }, { status: 201 });
  });
}
