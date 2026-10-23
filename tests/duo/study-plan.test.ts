import { beforeEach, describe, expect, it, vi } from "vitest";
import { daysUntilExam, examCountdown } from "@/lib/exam";
import { studyPlanPath } from "@/lib/study-plan";

const student = vi.fn();
const storage = { list: vi.fn(), remove: vi.fn(), createSignedUploadUrl: vi.fn(), createSignedUrl: vi.fn(), download: vi.fn() };
// Escolha de cronograma guardada em study_plan_choices (a sessão do aluno, com RLS).
let choice: { plano: string } | null = null;
const choices = { upsert: vi.fn(async (row: { plano: string }) => { choice = { plano: row.plano }; return { error: null }; }), deleted: vi.fn() };
const supabase = { from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: choice, error: null }) }) }),
  upsert: choices.upsert,
  delete: () => ({ eq: () => ({ eq: async (_column: string, value: string) => { choices.deleted(value); if (choice?.plano === value) choice = null; return { error: null }; } }) }),
}) };
vi.mock("@/lib/server/auth", () => ({ requireStudent: () => student() }));
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => ({ storage: { from: () => storage } }) }));
import { DELETE, GET, POST } from "@/app/api/cronograma/route";
import { GET as openPlan } from "@/app/api/cronograma/arquivo/route";
import { GET as planContent } from "@/app/api/cronograma/conteudo/route";
import { PUT as choosePlan } from "@/app/api/cronograma/plano/route";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  student.mockResolvedValue({ supabase, user: { id: "u1" } });
  choice = null;
  Object.values(storage).forEach((fn) => fn.mockReset());
  storage.remove.mockResolvedValue({ error: null });
});

describe("contagem para a prova (10/01/2027)", () => {
  it("conta os dias no calendário de Brasília", () => {
    expect(daysUntilExam(new Date("2026-10-22T12:00:00Z"))).toBe(80);
    expect(daysUntilExam(new Date("2027-01-10T02:00:00Z"))).toBe(1); // ainda 9/1 em Brasília
    expect(examCountdown(new Date("2027-01-10T15:00:00Z"))).toBe("A prova é hoje. Boa prova!");
    expect(examCountdown(new Date("2027-01-12T15:00:00Z"))).toBe("A prova já aconteceu");
  });
});

describe("studyPlanPath", () => {
  it("aceita formatos do cronograma e limpa o nome", () => {
    expect(studyPlanPath("u1", "Cronograma Reta Final — DPE.pdf", 1000)).toEqual({ path: "u1/Cronograma-Reta-Final-DPE.pdf", contentType: "application/pdf" });
    expect(studyPlanPath("u1", "plano.xlsx", 10)).toMatchObject({ path: "u1/plano.xlsx" });
  });
  it("recusa formato, tamanho e nome inválidos", () => {
    expect(studyPlanPath("u1", "virus.exe", 10)).toHaveProperty("error");
    expect(studyPlanPath("u1", "plano.pdf", 11 * 1024 * 1024)).toHaveProperty("error");
    expect(studyPlanPath("u1", "plano.pdf", 0)).toHaveProperty("error");
    expect(studyPlanPath("u1", "", 10)).toHaveProperty("error");
  });
});

describe("/api/cronograma", () => {
  it("POST prepara o envio na pasta do aluno e apaga o arquivo anterior", async () => {
    storage.list.mockResolvedValue({ data: [{ name: "antigo.png" }], error: null });
    storage.createSignedUploadUrl.mockResolvedValue({ data: { path: "u1/plano.pdf", token: "tk" }, error: null });
    const response = await POST(new Request("http://x/api/cronograma", { method: "POST", body: JSON.stringify({ fileName: "plano.pdf", size: 2048 }) }));
    expect(await response.json()).toEqual({ path: "u1/plano.pdf", token: "tk", contentType: "application/pdf" });
    expect(storage.list).toHaveBeenCalledWith("u1", { limit: 20 });
    expect(storage.remove).toHaveBeenCalledWith(["u1/antigo.png"]);
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith("u1/plano.pdf", { upsert: true });
  });
  it("POST recusa formato não aceito", async () => {
    expect((await POST(new Request("http://x/api/cronograma", { method: "POST", body: JSON.stringify({ fileName: "a.exe", size: 10 }) }))).status).toBe(400);
  });
  it("GET informa o cronograma atual e os oficiais publicados; DELETE remove só os arquivos do aluno", async () => {
    storage.list.mockImplementation(async (folder: string) => ({ data: folder === "oficiais" ? [{ name: "6h.docx" }] : [{ name: "plano.pdf", updated_at: "2026-10-22T10:00:00Z", metadata: { size: 2048 } }], error: null }));
    expect(await (await GET()).json()).toEqual({ plano: "proprio", oficiais: { "3h": false, "4h": false, "6h": true }, file: { name: "plano.pdf", size: 2048, updatedAt: "2026-10-22T10:00:00Z" } });
    expect(await (await DELETE()).json()).toEqual({ removed: 1 });
    expect(storage.remove).toHaveBeenCalledWith(["u1/plano.pdf"]);
    expect(choices.deleted).toHaveBeenCalledWith("proprio");
  });
  it("o aluno escolhe o cronograma de 3h, 4h, 6h ou o próprio; outro valor é recusado", async () => {
    const put = (plano: unknown) => choosePlan(new Request("http://x/api/cronograma/plano", { method: "PUT", body: JSON.stringify({ plano }) }));
    expect(await (await put("6h")).json()).toEqual({ plano: "6h" });
    expect(choices.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", plano: "6h" }), { onConflict: "user_id" });
    expect(await (await put("3h")).json()).toEqual({ plano: "3h" });
    expect((await put("8h")).status).toBe(400);
    expect((await put("toString")).status).toBe(400);
  });
  it("conteúdo: lê o cronograma oficial escolhido; arquivo próprio que não é Word só abre", async () => {
    choice = { plano: "6h" };
    storage.download.mockResolvedValue({ data: null, error: { message: "not found" } });
    expect((await planContent()).status).toBe(404);
    expect(storage.download).toHaveBeenCalledWith("oficiais/6h.docx");
    choice = null;
    storage.list.mockResolvedValue({ data: [{ name: "plano.pdf" }], error: null });
    expect(await (await planContent()).json()).toEqual({ plano: "proprio", titulo: "plano.pdf", tipo: "arquivo" });
  });
  it("abrir redireciona para a URL assinada; sem arquivo, 404", async () => {
    storage.list.mockResolvedValue({ data: [{ name: "plano.pdf" }], error: null });
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://s/plano?t=1" }, error: null });
    const response = await openPlan();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://s/plano?t=1");
    expect(storage.createSignedUrl).toHaveBeenCalledWith("u1/plano.pdf", 60);
    storage.list.mockResolvedValue({ data: [], error: null });
    expect((await openPlan()).status).toBe(404);
  });
});
