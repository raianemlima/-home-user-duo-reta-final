import "server-only";
import { createAdminClient } from "@/lib/server/admin";
import { STUDY_PLAN_BUCKET } from "@/lib/study-plan";

export type OwnPlanFile = { name: string; path: string; size: number | null; updatedAt: string | null };
type StoredFile = { name: string; created_at?: string | null; updated_at?: string | null; metadata?: { size?: number } | null };

// Arquivos do cronograma próprio do aluno, o mais recente primeiro. Em geral há um só; numa troca (o novo já enviado,
// o antigo ainda não removido) vale o mais recente, em todas as telas.
export async function ownPlanFiles(userId: string): Promise<OwnPlanFile[]> {
  const { data, error } = await createAdminClient().storage.from(STUDY_PLAN_BUCKET).list(userId, { limit: 20 });
  if (error) throw new Error(`Falha ao ler o cronograma: ${error.message}`);
  return ((data ?? []) as StoredFile[])
    .filter((file) => file.name && file.name !== ".emptyFolderPlaceholder")
    .map((file) => ({ name: file.name, path: `${userId}/${file.name}`, size: file.metadata?.size ?? null, updatedAt: file.updated_at ?? file.created_at ?? null }))
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
}

// Depois que o arquivo novo chegou: os anteriores saem. Se a remoção falhar, nada se perde (vale o mais recente) e a
// próxima troca tenta de novo.
export async function dropOlderPlanFiles(userId: string): Promise<void> {
  const [, ...older] = await ownPlanFiles(userId);
  if (!older.length) return;
  const { error } = await createAdminClient().storage.from(STUDY_PLAN_BUCKET).remove(older.map((file) => file.path));
  if (error) console.warn(JSON.stringify({ at: new Date().toISOString(), route: "cronograma", stage: "cleanup", status: "error", detail: error.message }));
}
