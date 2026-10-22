import { beforeEach, describe, expect, it, vi } from "vitest";

const student = vi.fn();
const sign = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => ({ storage: { from: (bucket: string) => ({ createSignedUrl: (...args: unknown[]) => sign(bucket, ...args) }) } }) }));
import { GET } from "@/app/api/disciplinas/[slug]/original/route";

const rows = (version: unknown) => ({
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain; chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: table === "disciplines" ? { id: "d1" } : version, error: null });
    return chain;
  },
});
const get = () => GET(new Request("http://app.duo/api/disciplinas/penal/original"), { params: Promise.resolve({ slug: "penal" }) });

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true"); sign.mockReset().mockResolvedValue({ data: { signedUrl: "https://storage.example/signed?token=1" }, error: null }); });

describe("GET /api/disciplinas/[slug]/original", () => {
  it("aluno ativo é redirecionado para a URL assinada do PDF, com o nome original", async () => {
    student.mockResolvedValue({ supabase: rows({ source_path: "u/penal.pdf", source_file_name: "Direito Penal.pdf" }) });
    const response = await get();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.example/signed?token=1");
    expect(sign).toHaveBeenCalledWith("documents", "u/penal.pdf", 60, { download: "Direito Penal.pdf" });
  });
  it("versão sem PDF original: 404", async () => {
    student.mockResolvedValue({ supabase: rows({ source_path: null, source_file_name: null }) });
    expect((await get()).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });
});
