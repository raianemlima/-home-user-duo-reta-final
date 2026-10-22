import { NextResponse } from "next/server";
import { searchDiscipline } from "@/lib/reader/queries";
import { requireStudent } from "@/lib/server/auth";
import { handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleRoute("busca", async () => {
    const { supabase } = await requireStudent();
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ results: await searchDiscipline(supabase, params.get("disciplina") ?? "", params.get("q") ?? "") });
  });
}
