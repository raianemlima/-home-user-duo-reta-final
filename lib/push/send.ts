import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

export type PushMessage = { title: string; body: string; url: string };
type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

const PAGE = 1000;
const BATCH = 25;
// Cada id vai na URL do PostgREST: lotes pequenos evitam URLs longas demais para o gateway.
const ID_CHUNK = 100;

// Quem ainda tem acesso ativo. Aparelho de aluno desativado deixa de receber, mas a inscrição fica: reativado, volta a
// receber. null = não deu para conferir (aí ninguém recebe, em vez de avisar quem não tem mais acesso).
async function activeUsers(admin: SupabaseClient, userIds: string[]): Promise<Set<string> | null> {
  const ids = [...new Set(userIds)];
  const active = new Set<string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await admin.from("profiles").select("user_id").eq("active", true).in("user_id", ids.slice(i, i + ID_CHUNK));
    if (error) return null;
    for (const row of (data ?? []) as { user_id: string }[]) active.add(row.user_id);
  }
  return active;
}

export const isPushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

// Avisa os aparelhos inscritos de quem tem acesso ativo. Nunca lança: um aviso que falha não pode quebrar a publicação do material.
export async function notifyStudents(admin: SupabaseClient, message: PushMessage): Promise<{ sent: number; removed: number }> {
  const result = { sent: 0, removed: 0 };
  if (!isPushConfigured()) return result;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:equipe@cursosduo.com.br", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string, process.env.VAPID_PRIVATE_KEY as string);
    const payload = JSON.stringify(message);
    const gone: string[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").order("id").range(from, from + PAGE - 1);
      if (error) break;
      const page = (data ?? []) as Subscription[];
      const active = await activeUsers(admin, page.map((row) => row.user_id));
      if (!active) break;
      const rows = page.filter((row) => active.has(row.user_id));
      for (let i = 0; i < rows.length; i += BATCH) {
        await Promise.all(rows.slice(i, i + BATCH).map(async (row) => {
          try { await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { TTL: 60 * 60 * 24 * 3 }); result.sent += 1; }
          catch (failure) { const status = (failure as { statusCode?: number }).statusCode; if (status === 404 || status === 410) gone.push(row.id); }
        }));
      }
      if (page.length < PAGE) break;
    }
    if (gone.length) { await admin.from("push_subscriptions").delete().in("id", gone); result.removed = gone.length; }
  } catch (failure) {
    console.error(JSON.stringify({ at: new Date().toISOString(), route: "push.notify", status: "error", detail: failure instanceof Error ? failure.message : "erro desconhecido" }));
  }
  return result;
}
