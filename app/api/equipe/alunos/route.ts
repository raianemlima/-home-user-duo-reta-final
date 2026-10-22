import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStaff } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";
import { MAX_STUDENTS_PER_BATCH, parseStudentList } from "@/lib/students/parse";

export const dynamic = "force-dynamic";
// Cada e-mail vai na URL do PostgREST: lotes pequenos evitam URLs longas demais para o gateway.
const chunks = (values: string[], size = 100) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));

export function GET() {
  return handleRoute("equipe.alunos.listar", async () => {
    const { supabase } = await requireStaff();
    const { data, error } = await supabase.from("profiles").select("user_id, email, name, role, active, created_at").order("email");
    if (error) throw new Error(`Falha ao listar alunos: ${error.message}`);
    return NextResponse.json({ students: data ?? [] });
  });
}

// Cadastra uma lista de e-mails: quem já tem perfil é reativado; os demais são criados com a senha padrão. Uma falha não interrompe o lote.
export function POST(request: Request) {
  return handleRoute("equipe.alunos.cadastrar", async () => {
    const { supabase } = await requireStaff();
    const body = await readJson(request);
    if (typeof body.list !== "string") throw new ApiError(400, "invalid_request", "Cole a lista de e-mails.");
    const parsed = parseStudentList(body.list);
    if (!parsed.valid.length && !parsed.invalid.length) throw new ApiError(400, "invalid_request", "A lista está vazia.");
    if (parsed.valid.length > MAX_STUDENTS_PER_BATCH) throw new ApiError(400, "invalid_request", `Envie no máximo ${MAX_STUDENTS_PER_BATCH} alunos por vez.`);

    const emails = parsed.valid.map((student) => student.email);
    const known = new Map<string, string>();
    for (const batch of chunks(emails)) {
      const { data: existing, error } = await supabase.from("profiles").select("user_id, email").in("email", batch);
      if (error) throw new Error(`Falha ao conferir cadastros: ${error.message}`);
      for (const row of (existing ?? []) as { user_id: string; email: string }[]) known.set(row.email, row.user_id);
    }
    const reactivated = emails.filter((email) => known.has(email));
    for (const batch of chunks(reactivated)) {
      const { error: updateError } = await supabase.from("profiles").update({ active: true }).in("email", batch);
      if (updateError) throw new Error(`Falha ao reativar alunos: ${updateError.message}`);
    }

    const password = process.env.ALUNO_SENHA_PADRAO;
    const newcomers = parsed.valid.filter((candidate) => !known.has(candidate.email));
    if (newcomers.length && !password) throw new ApiError(500, "missing_config", "Defina ALUNO_SENHA_PADRAO no servidor para cadastrar novos alunos.");
    const admin = createAdminClient();
    const invited: string[] = [];
    const failed: { email: string; reason: string }[] = [];
    for (const student of newcomers) {
      // Sem e-mail de convite: o aluno entra com e-mail + senha padrão do curso.
      const { data, error: inviteError } = await admin.auth.admin.createUser({ email: student.email, password, email_confirm: true });
      if (inviteError || !data?.user) { failed.push({ email: student.email, reason: inviteError?.message ?? "usuário não criado" }); continue; }
      const { error: profileError } = await supabase.from("profiles").insert({ user_id: data.user.id, email: student.email, name: student.name, role: "aluno", active: true, must_change_password: true });
      if (profileError) { failed.push({ email: student.email, reason: profileError.message }); continue; }
      invited.push(student.email);
    }
    return NextResponse.json({ invited, reactivated, invalid: parsed.invalid, duplicates: parsed.duplicates, failed });
  });
}
