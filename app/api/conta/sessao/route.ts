import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/admin";
import { requireStudent } from "@/lib/server/auth";
import { handleRoute } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Um acesso por conta: ao entrar, o aluno encerra as sessões dos outros aparelhos. A equipe pode usar vários aparelhos.
export function POST() {
  return handleRoute("conta.sessao", async () => {
    const { supabase, profile } = await requireStudent();
    if (profile.role !== "aluno") return NextResponse.json({ revoked: false });
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return NextResponse.json({ revoked: false });
    const { error } = await createAdminClient().auth.admin.signOut(token, "others");
    if (error) throw new Error(`Falha ao encerrar as outras sessões: ${error.message}`);
    return NextResponse.json({ revoked: true });
  });
}
