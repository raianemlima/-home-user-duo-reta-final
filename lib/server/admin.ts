import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readServerEnv, ServerEnvError } from "@/lib/server/env";

// Cliente com a chave de serviço (ignora RLS). Só para convites de alunos e reancoragem na publicação.
export function createAdminClient(): SupabaseClient {
  const env = readServerEnv();
  if (!env.serviceRoleKey) throw new ServerEnvError("Configuração ausente no servidor: SUPABASE_SERVICE_ROLE_KEY.", ["SUPABASE_SERVICE_ROLE_KEY"]);
  return createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
