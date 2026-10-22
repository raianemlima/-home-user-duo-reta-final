import { NextResponse } from "next/server";
import { validateNewPassword } from "@/lib/auth/password";
import { createAdminClient } from "@/lib/server/admin";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handleRoute, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Troca de senha do próprio usuário (obrigatória no primeiro acesso do aluno). A sessão vem do cookie; o aviso de
// "trocar a senha" só é baixado com a chave de serviço, porque o aluno não tem permissão de alterar o próprio perfil.
export function POST(request: Request) {
  return handleRoute("conta.senha", async () => {
    const { supabase, user } = await requireUser();
    const body = await readJson(request);
    const problem = validateNewPassword(body.password, process.env.ALUNO_SENHA_PADRAO);
    if (problem) throw new ApiError(400, "invalid_request", problem);
    const { error } = await supabase.auth.updateUser({ password: body.password as string });
    if (error) throw new ApiError(400, "invalid_request", "Não foi possível trocar a senha. Tente uma senha diferente.");
    const { error: flagError } = await createAdminClient().from("profiles").update({ must_change_password: false }).eq("user_id", user.id);
    if (flagError) throw new Error(`Falha ao atualizar o perfil: ${flagError.message}`);
    return NextResponse.json({ changed: true });
  });
}
