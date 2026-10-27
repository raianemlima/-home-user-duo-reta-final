import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";

// Cotas por aluno (o máximo e a janela ficam na função take_rate_limit, migração 0020).
export type RateBucket = "pdf" | "export";
const MESSAGES: Record<RateBucket, string> = {
  pdf: "Você abriu muitos PDFs em pouco tempo. Aguarde alguns minutos e tente de novo.",
  export: "Você exportou o caderno muitas vezes em pouco tempo. Aguarde alguns minutos e tente de novo.",
};

// Conta uma operação pesada do aluno, com a sessão dele, e recusa com 429 acima da cota. Se o banco não responder
// (ou ainda não tiver a migração), deixa passar: a cota protege contra abuso, não é barreira de acesso, e uma falha
// nela não pode impedir o aluno de baixar o material.
export async function enforceRateLimit(supabase: SupabaseClient, bucket: RateBucket): Promise<void> {
  const { data, error } = await supabase.rpc("take_rate_limit", { p_bucket: bucket });
  if (error) { console.warn(JSON.stringify({ at: new Date().toISOString(), route: "rate-limit", stage: bucket, status: "skipped", detail: error.message })); return; }
  if (data === false) throw new ApiError(429, "rate_limited", MESSAGES[bucket]);
}
