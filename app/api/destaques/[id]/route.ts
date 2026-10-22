import { NextResponse } from "next/server";
import { HIGHLIGHT_COLUMNS, toHighlightView } from "@/lib/highlights/server";
import { isHighlightColor } from "@/lib/highlights/types";
import { requireStudent } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const MAX_NOTE = 2000;

async function idOf(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) throw new ApiError(400, "invalid_request", "Grifo inválido.");
  return id;
}

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("destaques.alterar", async () => {
    const { supabase, user } = await requireStudent();
    const id = await idOf(context);
    const body = await readJson(request);
    const changes: Record<string, unknown> = {};
    if (body.color !== undefined) { if (!isHighlightColor(body.color)) throw new ApiError(400, "invalid_request", "Cor de grifo inválida."); changes.color = body.color; }
    if (body.note !== undefined) {
      if (body.note !== null && typeof body.note !== "string") throw new ApiError(400, "invalid_request", "Anotação inválida.");
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (note.length > MAX_NOTE) throw new ApiError(400, "invalid_request", `A anotação pode ter até ${MAX_NOTE} caracteres.`);
      changes.note = note || null;
    }
    if (body.reviewed !== undefined) { if (typeof body.reviewed !== "boolean") throw new ApiError(400, "invalid_request", "Valor inválido para revisado."); changes.reviewed_at = body.reviewed ? new Date().toISOString() : null; }
    if (!Object.keys(changes).length) throw new ApiError(400, "invalid_request", "Nada a alterar.");
    const { data, error } = await supabase.from("highlights").update(changes).eq("id", id).eq("user_id", user.id).select(HIGHLIGHT_COLUMNS);
    if (error) throw new Error(`Falha ao alterar o grifo: ${error.message}`);
    const row = (data as Record<string, unknown>[] | null)?.[0];
    if (!row) throw new ApiError(404, "not_found", "Grifo não encontrado.");
    return NextResponse.json({ highlight: toHighlightView(row) });
  });
}

export function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleRoute("destaques.excluir", async () => {
    const { supabase, user } = await requireStudent();
    const id = await idOf(context);
    const { data } = await supabase.from("highlights").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "Grifo não encontrado.");
    const { error } = await supabase.from("highlights").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(`Falha ao excluir o grifo: ${error.message}`);
    return NextResponse.json({ deleted: true });
  });
}
