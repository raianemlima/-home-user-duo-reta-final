import { PDFDocument } from "@cantoo/pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const student = vi.fn();
const sign = vi.fn();
const download = vi.fn();
const upload = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => ({ storage: { from: (bucket: string) => ({ createSignedUrl: (...args: unknown[]) => sign(bucket, ...args), download: (...args: unknown[]) => download(bucket, ...args), upload: (...args: unknown[]) => upload(bucket, ...args) }) } }) }));
import { GET } from "@/app/api/disciplinas/[slug]/original/route";

const rows = (version: unknown) => ({
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain; chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: table === "disciplines" ? { id: "d1", title: "Direito Penal" } : version, error: null });
    return chain;
  },
});
const get = (slug = "penal") => GET(new Request(`http://app.duo/api/disciplinas/${slug}/original`), { params: Promise.resolve({ slug }) });
const user = { id: "aluno-1", email: "ana@x.com" };

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  sign.mockReset().mockResolvedValue({ data: { signedUrl: "https://storage.example/signed?token=1" }, error: null });
  const pdf = await PDFDocument.create(); pdf.addPage([300, 400]);
  const bytes = await pdf.save();
  download.mockReset().mockResolvedValue({ data: new Blob([bytes]), error: null });
  upload.mockReset().mockResolvedValue({ error: null });
});

describe("GET /api/disciplinas/[slug]/original", () => {
  it("entrega o PDF protegido (criptografado, com o e-mail do aluno) por URL assinada, com o nome original", async () => {
    student.mockResolvedValue({ supabase: rows({ source_path: "u/penal.pdf", source_file_name: "Direito Penal.pdf" }), user });
    const response = await get();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.example/signed?token=1");
    expect(download).toHaveBeenCalledWith("documents", "u/penal.pdf");
    const [bucket, path, bytes] = upload.mock.calls[0] as [string, string, Uint8Array];
    expect([bucket, path]).toEqual(["documents", "protegidos/aluno-1/ebook-penal.pdf"]);
    expect(new TextDecoder("latin1").decode(bytes)).toContain("/Encrypt");
    expect(sign).toHaveBeenCalledWith("documents", "protegidos/aluno-1/ebook-penal.pdf", 60, { download: "Direito Penal.pdf" });
  });
  it("Vade Esperto lido no app: o PDF é o do Vade Esperto, nunca o Word importado", async () => {
    student.mockResolvedValue({ supabase: rows({ source_path: "u/cf.docx", source_file_name: "Vade Esperto - CF.docx" }), user });
    expect((await get("vade-esperto-constituicao")).status).toBe(302);
    expect(download).toHaveBeenCalledWith("vade-esperto", "constituicao.pdf");
  });
  it("versão sem PDF original (ou só com Word): 404", async () => {
    student.mockResolvedValue({ supabase: rows({ source_path: null, source_file_name: null }), user });
    expect((await get()).status).toBe(404);
    student.mockResolvedValue({ supabase: rows({ source_path: "u/penal.docx", source_file_name: "Penal.docx" }), user });
    expect((await get()).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
});
