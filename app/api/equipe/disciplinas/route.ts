import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type VersionRow = { id: string; discipline_id: string; label: string; status: string; created_at: string; published_at: string | null };

export function GET() {
  return handleRoute("equipe.disciplinas.listar", async () => {
    const { supabase } = await requireStaff();
    const { data: disciplines, error } = await supabase.from("disciplines").select("id, slug, title, position").order("position");
    if (error) throw new Error(`Falha ao listar disciplinas: ${error.message}`);
    const { data: versions, error: versionError } = await supabase.from("content_versions").select("id, discipline_id, label, status, created_at, published_at").neq("status", "archived");
    if (versionError) throw new Error(`Falha ao listar versões: ${versionError.message}`);
    const rows = (versions ?? []) as VersionRow[];
    return NextResponse.json({ disciplines: (disciplines ?? []).map((discipline) => {
      const own = rows.filter((version) => version.discipline_id === discipline.id);
      const published = own.find((version) => version.status === "published");
      return { ...discipline, published: published ? { id: published.id, label: published.label, publishedAt: published.published_at } : null, drafts: own.filter((version) => version.status === "draft").map((version) => ({ id: version.id, label: version.label, createdAt: version.created_at })) };
    }) });
  });
}

export function POST(request: Request) {
  return handleRoute("equipe.disciplinas.criar", async () => {
    const { supabase } = await requireStaff();
    const body = await readJson(request);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!title || title.length > 200) throw new ApiError(400, "invalid_request", "Informe o nome da disciplina (até 200 caracteres).");
    if (!SLUG.test(slug) || slug.length > 60) throw new ApiError(400, "invalid_request", "O endereço deve ter só letras minúsculas, números e hífens (ex.: direito-penal).");
    const { data: existing } = await supabase.from("disciplines").select("id").eq("slug", slug).maybeSingle();
    if (existing) throw new ApiError(409, "conflict", "Já existe uma disciplina com esse endereço.");
    const { data: last } = await supabase.from("disciplines").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from("disciplines").insert({ title, slug, position: ((last?.position as number | undefined) ?? 0) + 1 }).select("id, slug, title, position").single();
    if (error || !data) throw new Error(`Falha ao criar a disciplina: ${error?.message ?? "sem retorno"}`);
    return NextResponse.json({ discipline: data }, { status: 201 });
  });
}
