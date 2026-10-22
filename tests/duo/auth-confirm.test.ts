import { describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { verifyOtp, exchangeCodeForSession } }) }));
import { GET } from "@/app/auth/confirm/route";

const go = async (query: string) => new URL((await GET(new Request(`http://app.duo/auth/confirm?${query}`))).headers.get("location") as string);

describe("/auth/confirm", () => {
  it("token válido abre sessão e segue para o destino interno", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    expect((await go("token_hash=t&type=invite&next=%2Fcaderno")).pathname).toBe("/caderno");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "t" });
  });
  it("link com ?code= (modelo padrão do Supabase) troca o código por sessão", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    expect((await go("code=abc&next=%2Fcaderno")).pathname).toBe("/caderno");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad" } });
    expect((await go("code=abc")).search).toBe("?motivo=link-expirado");
  });
  it("destino externo é ignorado", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const target = await go("token_hash=t&type=email&next=%2F%2Fevil.com");
    expect(target.host).toBe("app.duo");
    expect(target.pathname).toBe("/");
  });
  it("token inválido ou ausente volta ao login com motivo", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    expect((await go("token_hash=t&type=email")).search).toBe("?motivo=link-expirado");
    expect((await go("type=email")).search).toBe("?motivo=link-expirado");
  });
});
