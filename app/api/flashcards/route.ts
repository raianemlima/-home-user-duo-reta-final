import { NextResponse } from "next/server";
import { AnchorError, createAnchor } from "@/lib/highlights/anchor";
import { sectionTextOf } from "@/lib/highlights/server";
import type { Point } from "@/lib/highlights/types";
import { validGaps } from "@/lib/flashcards/cloze";
import { cardContext, CARD_COLUMNS, failure, listCards, MAX_CARDS, MAX_PERGUNTA, MAX_TEXTO, missingTable, toCardView } from "@/lib/flashcards/server";
import { todayBR } from "@/lib/flashcards/schedule";
import { requireStudent } from "@/lib/server/auth";
import { UUID_PATTERN } from "@/lib/server/documents";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const point = (value: unknown): Point | null => {
  const candidate = value as Partial<Point> | null;
  return candidate && typeof candidate.paragraphId === "string" && UUID_PATTERN.test(candidate.paragraphId) && Number.isInteger(candidate.offset) && (candidate.offset as number) >= 0 ? { paragraphId: candidate.paragraphId, offset: candidate.offset as number } : null;
};

// Cartões do aluno, com a disciplina e o link para a seção de origem (se ela ainda existir).
export function GET(request: Request) {
  return handleRoute("flashcards.listar", async () => {
    const { supabase, user } = await requireStudent();
    const hoje = todayBR(new Date());
    // Resumo para o Início: só as contagens, sem baixar os cartões.
    if (new URL(request.url).searchParams.get("resumo") === "1") {
      const [due, all] = await Promise.all([
        supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("due_on", hoje),
        supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      const failed = due.error ?? all.error;
      if (failed) {
        if (missingTable(failed)) return NextResponse.json({ disponivel: false, hoje, paraHoje: 0, total: 0 });
        throw new Error(`Falha ao contar os flashcards: ${failed.message}`);
      }
      return NextResponse.json({ disponivel: true, hoje, paraHoje: due.count ?? 0, total: all.count ?? 0 }, { headers: { "cache-control": "private, no-store" } });
    }
    const { rows, error } = await listCards(supabase, user.id);
    if (error) {
      if (missingTable(error)) return NextResponse.json({ disponivel: false, hoje, cards: [] });
      throw new Error(`Falha ao listar os flashcards: ${error.message}`);
    }
    const { disciplines, alive } = await cardContext(supabase, rows);
    const cards = rows.map((row) => toCardView(row, disciplines.get(row.discipline_id as string), alive.has(row.section_id as string)));
    return NextResponse.json({ disponivel: true, hoje, cards }, { headers: { "cache-control": "private, no-store" } });
  });
}

// Cria um cartão a partir de um trecho selecionado. O trecho é recalculado no servidor a partir do texto publicado:
// o cliente envia só as posições (como nos grifos) e, na lacuna, os intervalos escondidos dentro do trecho.
export function POST(request: Request) {
  return handleRoute("flashcards.criar", async () => {
    const { supabase, user } = await requireStudent();
    const body = await readJson(request);
    const versionId = typeof body.versionId === "string" && UUID_PATTERN.test(body.versionId) ? body.versionId : null;
    const start = point(body.start), end = point(body.end);
    if (!versionId || !start || !end) throw new ApiError(400, "invalid_request", "Seleção inválida.");
    if (body.tipo !== "lacuna" && body.tipo !== "pergunta") throw new ApiError(400, "invalid_request", "Tipo de cartão inválido.");
    const section = await sectionTextOf(supabase, versionId, start.paragraphId);
    if (!section) throw new ApiError(400, "invalid_request", "Este trecho não está no material publicado.");
    let quote: string;
    try { quote = createAnchor(section.doc, start, end).quote; } catch (error) { if (error instanceof AnchorError) throw new ApiError(400, "invalid_request", error.message); throw error; }
    if (quote.length > MAX_TEXTO) throw new ApiError(400, "invalid_request", `O trecho do cartão pode ter até ${MAX_TEXTO} caracteres. Selecione um trecho menor.`);
    const pergunta = typeof body.pergunta === "string" ? body.pergunta.trim() : "";
    if (body.tipo === "pergunta" && !pergunta) throw new ApiError(400, "invalid_request", "Escreva a pergunta do cartão.");
    if (pergunta.length > MAX_PERGUNTA) throw new ApiError(400, "invalid_request", `A pergunta pode ter até ${MAX_PERGUNTA} caracteres.`);
    if (body.tipo === "lacuna" && !validGaps(quote, body.lacunas)) throw new ApiError(400, "invalid_request", "Escolha pelo menos uma palavra para esconder.");
    const { count, data: existing, error: countError } = await supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (countError) failure(countError, "contar os flashcards");
    if ((count ?? (Array.isArray(existing) ? existing.length : 0)) >= MAX_CARDS) throw new ApiError(400, "limit_reached", `Você chegou ao limite de ${MAX_CARDS} cartões. Exclua alguns para criar novos.`);
    const paragraph = section.doc.paragraphs.find((item) => item.id === start.paragraphId);
    const { data: discipline } = await supabase.from("disciplines").select("slug, title").eq("id", section.disciplineId).maybeSingle();
    const origem = [discipline?.title, ...(paragraph?.sectionPath ?? [])].filter((part) => part && String(part).trim()).join(" › ").slice(0, 300);
    const { data, error } = await supabase.from("flashcards").insert({ user_id: user.id, discipline_id: section.disciplineId, section_id: paragraph?.sectionId ?? null, origem, tipo: body.tipo, texto: quote, pergunta: body.tipo === "pergunta" ? pergunta : null, lacunas: body.tipo === "lacuna" ? body.lacunas : [], due_on: todayBR(new Date()) }).select(CARD_COLUMNS).single();
    if (error || !data) failure(error ?? { message: "sem retorno" }, "salvar o flashcard");
    return NextResponse.json({ card: toCardView(data, discipline ?? null, true) }, { status: 201 });
  });
}
