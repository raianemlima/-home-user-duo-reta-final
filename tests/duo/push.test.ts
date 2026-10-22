import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectPlatform, urlBase64ToUint8Array } from "@/lib/pwa";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...args) } }));
const student = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
const adminUpsert = vi.fn();
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => ({ from: () => ({ upsert: (...args: unknown[]) => adminUpsert(...args) }) }) }));
import { notifyStudents } from "@/lib/push/send";
import { DELETE, POST } from "@/app/api/notificacoes/inscricao/route";

const subs = [{ id: "1", endpoint: "https://push.example/a", p256dh: "k", auth: "a" }, { id: "2", endpoint: "https://push.example/b", p256dh: "k", auth: "a" }];
const fakeAdmin = (deleted: string[][]) => ({ from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: subs, error: null }) }) }), delete: () => ({ in: async (_column: string, ids: string[]) => { deleted.push(ids); return { error: null }; } }) }) }) as never;

beforeEach(() => {
  sendNotification.mockReset().mockResolvedValue({});
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub"); vi.stubEnv("VAPID_PRIVATE_KEY", "priv"); vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
});

describe("notifyStudents", () => {
  it("envia para todos os aparelhos inscritos", async () => {
    expect(await notifyStudents(fakeAdmin([]), { title: "t", body: "b", url: "/" })).toEqual({ sent: 2, removed: 0 });
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({ title: "t", body: "b", url: "/" });
  });
  it("remove aparelhos que não existem mais (410) e segue com os demais", async () => {
    sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    const deleted: string[][] = [];
    expect(await notifyStudents(fakeAdmin(deleted), { title: "t", body: "b", url: "/" })).toEqual({ sent: 1, removed: 1 });
    expect(deleted).toEqual([["1"]]);
  });
  it("sem chaves VAPID não envia nada nem lança", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await notifyStudents(fakeAdmin([]), { title: "t", body: "b", url: "/" })).toEqual({ sent: 0, removed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("/api/notificacoes/inscricao", () => {
  const request = (method: string, body: unknown) => new Request("http://app.duo/api/notificacoes/inscricao", { method, body: JSON.stringify(body) });
  it("grava a inscrição do aluno logado, mesmo se o aparelho era de outro aluno", async () => {
    adminUpsert.mockReset().mockResolvedValue({ error: null });
    student.mockResolvedValue({ supabase: {}, user: { id: "u1" } });
    expect((await POST(request("POST", { endpoint: "https://push.example/a", keys: { p256dh: "k", auth: "a" } }))).status).toBe(201);
    expect(adminUpsert).toHaveBeenCalledWith({ user_id: "u1", endpoint: "https://push.example/a", p256dh: "k", auth: "a" }, { onConflict: "endpoint" });
  });
  it("recusa inscrição incompleta ou fora de https", async () => {
    student.mockResolvedValue({ supabase: { from: () => ({}) }, user: { id: "u1" } });
    expect((await POST(request("POST", { endpoint: "http://x", keys: { p256dh: "k", auth: "a" } }))).status).toBe(400);
    expect((await POST(request("POST", { endpoint: "https://x" }))).status).toBe(400);
  });
  it("remove só a inscrição do próprio aluno", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null }); const eq1 = vi.fn(() => ({ eq: eq2 }));
    student.mockResolvedValue({ supabase: { from: () => ({ delete: () => ({ eq: eq1 }) }) }, user: { id: "u1" } });
    expect((await DELETE(request("DELETE", { endpoint: "https://push.example/a" }))).status).toBe(200);
    expect(eq1).toHaveBeenCalledWith("endpoint", "https://push.example/a"); expect(eq2).toHaveBeenCalledWith("user_id", "u1");
  });
});

describe("detectPlatform", () => {
  it("reconhece app instalado, iPhone, Android e computador", () => {
    expect(detectPlatform("qualquer", true)).toBe("installed");
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", false)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", false, 5)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)", false)).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", false)).toBe("other");
  });
  it("converte a chave VAPID de base64 url para bytes", () => {
    expect([...urlBase64ToUint8Array("AQID")]).toEqual([1, 2, 3]);
    expect([...urlBase64ToUint8Array("-_8")]).toEqual([251, 255]);
  });
});
