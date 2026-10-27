import { PDFDocument } from "@cantoo/pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const student = vi.fn();
const sign = vi.fn();
const download = vi.fn();
const upload = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => ({ storage: { from: (bucket: string) => ({ createSignedUrl: (...args: unknown[]) => sign(bucket, ...args), download: (...args: unknown[]) => download(bucket, ...args), upload: (...args: unknown[]) => upload(bucket, ...args) }) } }) }));
import { GET } from "@/app/api/disciplinas/[slug]/original/route";

// vade: as matérias do Vade Esperto com PDF publicado (tabela vade_esperto).
const rows = (version: unknown, title = "Direito Penal", vade: string[] = []) => ({
  from: (table: string) => {
    const chain: Record<string, unknown> = {}; const filters: Record<string, unknown> = {};
    chain.select = () => chain; chain.eq = (column: string, value: unknown) => { filters[column] = value; return chain; };
    chain.maybeSingle = async () => ({ data: table === "disciplines" ? { id: "d1", title } : table === "vade_esperto" ? (vade.includes(filters.slug as string) ? { slug: filters.slug } : null) : version, error: null });
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
    student.mockResolvedValue({ supabase: rows({ source_path: "u/cf.docx", source_file_name: "Vade Esperto - CF.docx" }, "Vade Esperto – Constituição Federal", ["constituicao"]), user });
    expect((await get("vade-esperto-constituicao")).status).toBe(302);
    expect(download).toHaveBeenCalledWith("vade-esperto", "constituicao.pdf");
  });
  it("Vade Esperto com o endereço criado a partir do título: a matéria vem do título, como na página Vade Esperto", async () => {
    student.mockResolvedValue({ supabase: rows({ source_path: "u/cpp.docx", source_file_name: "Vade Esperto - CPP.docx" }, "Vade Esperto – Código de Processo Penal", ["processo-penal"]), user });
    expect((await get("vade-esperto-codigo-de-processo-penal")).status).toBe(302);
    expect(download).toHaveBeenCalledWith("vade-esperto", "processo-penal.pdf");
    expect(sign).toHaveBeenCalledWith("documents", "protegidos/aluno-1/vade-processo-penal.pdf", 60, { download: "Vade Esperto - Código de Processo Penal.pdf" });
  });
  it("Vade Esperto cujo PDF ainda não foi publicado: 404 com aviso, sem tentar gerar o arquivo", async () => {
    student.mockResolvedValue({ supabase: rows({ source_path: "u/cpp.docx", source_file_name: "Vade Esperto - CPP.docx" }, "Vade Esperto – Código de Processo Penal"), user });
    const response = await get("vade-esperto-codigo-de-processo-penal");
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe("O PDF deste Vade Esperto ainda não foi publicado.");
    expect(download).not.toHaveBeenCalled();
  });
  it("versão sem PDF original (ou só com Word): 404", async () => {
    student.mockResolvedValue({ supabase: rows({ source_path: null, source_file_name: null }), user });
    expect((await get()).status).toBe(404);
    student.mockResolvedValue({ supabase: rows({ source_path: "u/penal.docx", source_file_name: "Penal.docx" }), user });
    expect((await get()).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
});
