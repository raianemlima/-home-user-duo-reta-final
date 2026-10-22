import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateNewPassword } from "@/lib/auth/password";

const requireUser = vi.fn(), requireStudent = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireUser: () => requireUser(), requireStudent: () => requireStudent() }));
const adminUpdate = vi.fn(), adminSignOut = vi.fn();
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => ({ from: () => ({ update: (changes: unknown) => ({ eq: (column: string, value: string) => adminUpdate(changes, column, value) }) }), auth: { admin: { signOut: (...args: unknown[]) => adminSignOut(...args) } } }) }));
import { POST as changePassword } from "@/app/api/conta/senha/route";
import { POST as closeOthers } from "@/app/api/conta/sessao/route";

const post = (handler: (request: Request) => Promise<Response>, body: unknown) => handler(new Request("http://app.duo/api/conta/senha", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true"); vi.stubEnv("ALUNO_SENHA_PADRAO", "senha-inicial-123");
  adminUpdate.mockReset().mockResolvedValue({ error: null }); adminSignOut.mockReset().mockResolvedValue({ error: null });
});

describe("validateNewPassword", () => {
  it("exige tamanho mínimo, diferente da senha inicial e não repetitiva", () => {
    expect(validateNewPassword("curta", "x")).toMatch(/pelo menos 8/);
    expect(validateNewPassword("senha-inicial-123", "senha-inicial-123")).toMatch(/diferente/);
    expect(validateNewPassword("aaaaaaaaaa", undefined)).toMatch(/previsível/);
    expect(validateNewPassword("minha-senha-nova", "senha-inicial-123")).toBeNull();
    expect(validateNewPassword(undefined, undefined)).not.toBeNull();
  });
});

describe("POST /api/conta/senha", () => {
  it("troca a senha e baixa o aviso de troca obrigatória", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: { auth: { updateUser } }, user: { id: "u1" } });
    expect((await post(changePassword, { password: "minha-senha-nova" })).status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ password: "minha-senha-nova" });
    expect(adminUpdate).toHaveBeenCalledWith({ must_change_password: false }, "user_id", "u1");
  });
  it("recusa a senha inicial e senhas curtas sem tocar na conta", async () => {
    const updateUser = vi.fn();
    requireUser.mockResolvedValue({ supabase: { auth: { updateUser } }, user: { id: "u1" } });
    expect((await post(changePassword, { password: "senha-inicial-123" })).status).toBe(400);
    expect((await post(changePassword, { password: "curta" })).status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled(); expect(adminUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/conta/sessao", () => {
  const session = (role: string, token: string | null) => ({ supabase: { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } }, profile: { role, active: true } });
  it("aluno: encerra as sessões dos outros aparelhos", async () => {
    requireStudent.mockResolvedValue(session("aluno", "jwt"));
    expect(await (await closeOthers()).json()).toEqual({ revoked: true });
    expect(adminSignOut).toHaveBeenCalledWith("jwt", "others");
  });
  it("equipe pode usar vários aparelhos", async () => {
    requireStudent.mockResolvedValue(session("equipe", "jwt"));
    expect(await (await closeOthers()).json()).toEqual({ revoked: false });
    expect(adminSignOut).not.toHaveBeenCalled();
  });
});
