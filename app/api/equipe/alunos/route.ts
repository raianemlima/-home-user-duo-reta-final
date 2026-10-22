import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";
import { MAX_STUDENTS_PER_BATCH, parseStudentList } from "@/lib/students/parse";

export const dynamic = "force-dynamic";

export function GET() {
  return handleRoute("equipe.alunos.listar", async () => {
    const { supabase } = await requireStaff();
    const { data, error } = await supabase.from("profiles").select("user_id, email, name, role, active, created_at").order("email");
    if (error) throw new Error(`Falha ao listar alunos: ${error.message}`);
    return NextResponse.json({ students: data ?? [] });
  });
}

// Cadastra uma lista de e-mails: quem já tem perfil é reativado; os demais recebem convite. Uma falha não interrompe o lote.
export function POST(request: Request) {
  return handleRoute("equipe.alunos.cadastrar", async () => {
    const { supabase } = await requireStaff();
    const body = await readJson(request);
    if (typeof body.list !== "string") throw new ApiError(400, "invalid_request", "Cole a lista de e-mails.");
    const parsed = parseStudentList(body.list);
    if (!parsed.valid.length && !parsed.invalid.length) throw new ApiError(400, "invalid_request", "A lista está vazia.");
    if (parsed.valid.length > MAX_STUDENTS_PER_BATCH) throw new ApiError(400, "invalid_request", `Envie no máximo ${MAX_STUDENTS_PER_BATCH} alunos por vez.`);

    const emails = parsed.valid.map((student) => student.email);
    const { data: existing, error } = emails.length ? await supabase.from("profiles").select("user_id, email").in("email", emails) : { data: [], error: null };
    if (error) throw new Error(`Falha ao conferir cadastros: ${error.message}`);
    const known = new Map(((existing ?? []) as { user_id: string; email: string }[]).map((row) => [row.email, row.user_id]));
    const reactivated = emails.filter((email) => known.has(email));
    if (reactivated.length) {
      const { error: updateError } = await supabase.from("profiles").update({ active: true }).in("email", reactivated);
      if (updateError) throw new Error(`Falha ao reativar alunos: ${updateError.message}`);
    }

    const admin = createAdminClient();
    const redirectTo = `${new URL(request.url).origin}/auth/confirm`;
    const invited: string[] = [];
    const failed: { email: string; reason: string }[] = [];
    for (const student of parsed.valid.filter((candidate) => !known.has(candidate.email))) {
      const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(student.email, { redirectTo });
      if (inviteError || !data?.user) { failed.push({ email: student.email, reason: inviteError?.message ?? "convite não enviado" }); continue; }
      const { error: profileError } = await supabase.from("profiles").insert({ user_id: data.user.id, email: student.email, name: student.name, role: "aluno", active: true });
      if (profileError) { failed.push({ email: student.email, reason: profileError.message }); continue; }
      invited.push(student.email);
    }
    return NextResponse.json({ invited, reactivated, invalid: parsed.invalid, duplicates: parsed.duplicates, failed });
  });
}
