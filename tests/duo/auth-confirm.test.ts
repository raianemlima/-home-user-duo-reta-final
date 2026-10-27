import { describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { verifyOtp, exchangeCodeForSession } }) }));
import { GET } from "@/app/auth/confirm/route";
import { safeNextPath } from "@/lib/auth/next-path";

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
    // "//site", "/\site" e "/<TAB>/site": o navegador leria os três como outro site.
    for (const next of ["%2F%2Fevil.com", "%2F%5Cevil.com", "%2F%09%2Fevil.com"]) {
      const target = await go(`token_hash=t&type=email&next=${next}`);
      expect(target.host).toBe("app.duo");
      expect(target.pathname).toBe("/");
    }
  });
  it("token inválido ou ausente volta ao login com motivo", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    expect((await go("token_hash=t&type=email")).search).toBe("?motivo=link-expirado");
    expect((await go("type=email")).search).toBe("?motivo=link-expirado");
  });
});

describe("destino depois do login (?next=)", () => {
  it("mantém caminhos do app, com busca e âncora", () => {
    for (const path of ["/", "/caderno", "/disciplinas/penal/s1?x=1#p-2", "/questoes?busca=a%5Cb"]) expect(safeNextPath(path)).toBe(path);
  });
  it("troca pelo início o que levaria a outro site ou não é caminho", () => {
    for (const value of [null, undefined, "", "caderno", "https://evil.com", "//evil.com", "///evil.com", "/\\evil.com", "/\\/evil.com", "/\t/evil.com", "/\n/evil.com", "/caderno\r\n"]) expect(safeNextPath(value)).toBe("/");
  });
  it("o destino aceito, resolvido como o navegador e o servidor resolvem, nunca sai do app", () => {
    for (const value of ["/..//evil.com", "/.//evil.com", "/%2F%2Fevil.com", "/%5Cevil.com", "/caderno/..//evil.com", "/\\evil.com", "//evil.com"]) expect(new URL(safeNextPath(value), "https://app.duo").host, value).toBe("app.duo");
  });
});
