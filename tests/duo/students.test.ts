import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStudentList } from "@/lib/students/parse";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";

const staff = vi.fn();
const invite = vi.fn();
vi.mock("@/lib/server/auth", () => ({ requireStaff: () => staff() }));
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => ({ ...makeFakeSupabase(db, "service"), auth: { admin: { createUser: (attributes: unknown) => invite(attributes) } } }) }));

import { GET as listStudents, POST as addStudents } from "@/app/api/equipe/alunos/route";
import { PATCH as patchStudent } from "@/app/api/equipe/alunos/[id]/route";

let db: FakeDb;
const post = (list: string) => addStudents(new Request("http://app.duo/api/equipe/alunos", { method: "POST", body: JSON.stringify({ list }) }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PIPELINE_V2", "true");
  vi.stubEnv("ALUNO_SENHA_PADRAO", "senha-de-teste");
  db = new FakeDb();
  staff.mockResolvedValue({ supabase: makeFakeSupabase(db, "equipe"), user: { id: "equipe" } });
  let n = 0;
  invite.mockReset().mockImplementation(async ({ email }: { email: string }) => ({ data: { user: { id: `u-${(n += 1)}`, email } }, error: null }));
});

describe("parseStudentList", () => {
  it("normaliza maiúsculas e espaços", () => {
    expect(parseStudentList(" Ana@Exemplo.com ").valid).toEqual([{ email: "ana@exemplo.com", name: "" }]);
  });
  it("aceita separadores variados e o formato Nome <email>", () => {
    const parsed = parseStudentList("Ana Souza <ana@x.com>; bia@x.com,\tcaio@x.com\n\n  Dora Lima <DORA@X.COM>");
    expect(parsed.valid).toEqual([{ email: "ana@x.com", name: "Ana Souza" }, { email: "bia@x.com", name: "" }, { email: "caio@x.com", name: "" }, { email: "dora@x.com", name: "Dora Lima" }]);
    expect(parsed.invalid).toEqual([]);
  });
  it("relata linhas inválidas e duplicados", () => {
    const parsed = parseStudentList("ana@x.com\nnão é email\nANA@x.com\nfoo@\n@bar.com");
    expect(parsed.valid.map((item) => item.email)).toEqual(["ana@x.com"]);
    expect(parsed.invalid).toEqual(["não é email", "foo@", "@bar.com"]);
    expect(parsed.duplicates).toEqual(["ana@x.com"]);
  });
});

describe("POST /api/equipe/alunos", () => {
  it("convida novos, cria perfil de aluno e relata inválidos", async () => {
    const response = await post("ana@x.com\nlixo\nbia@x.com");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ invited: ["ana@x.com", "bia@x.com"], reactivated: [], invalid: ["lixo"], duplicates: [], failed: [] });
    expect(invite).toHaveBeenCalledWith({ email: "ana@x.com", password: "senha-de-teste", email_confirm: true });
    expect(db.tables.profiles).toEqual([expect.objectContaining({ user_id: "u-1", email: "ana@x.com", role: "aluno", active: true }), expect.objectContaining({ user_id: "u-2", email: "bia@x.com" })]);
  });
  it("aluno já cadastrado é reativado, sem novo convite", async () => {
    db.tables.profiles.push({ user_id: "old", email: "ana@x.com", name: "", role: "aluno", active: false });
    const body = await (await post("ana@x.com")).json();
    expect(body.reactivated).toEqual(["ana@x.com"]);
    expect(body.invited).toEqual([]);
    expect(invite).not.toHaveBeenCalled();
    expect(db.tables.profiles[0].active).toBe(true);
  });
  it("falha de convite é relatada por e-mail e não interrompe o lote", async () => {
    invite.mockImplementationOnce(async () => ({ data: null, error: { message: "rate limit" } }));
    const body = await (await post("ana@x.com\nbia@x.com")).json();
    expect(body.failed).toEqual([{ email: "ana@x.com", reason: "rate limit" }]);
    expect(body.invited).toEqual(["bia@x.com"]);
  });
  it("sem ALUNO_SENHA_PADRAO não cria novos alunos", async () => {
    vi.stubEnv("ALUNO_SENHA_PADRAO", "");
    expect((await post("ana@x.com")).status).toBe(500);
    expect(invite).not.toHaveBeenCalled();
  });
  it("recusa lote acima de 500", async () => {
    const list = Array.from({ length: 501 }, (_, i) => `a${i}@x.com`).join("\n");
    expect((await post(list)).status).toBe(400);
    expect(invite).not.toHaveBeenCalled();
  });
});

describe("gestão de alunos", () => {
  it("desativa e lista", async () => {
    db.tables.profiles.push({ user_id: "a2222222-2222-4222-8222-222222222222", email: "ana@x.com", name: "", role: "aluno", active: true, created_at: "2026-10-01" });
    const response = await patchStudent(new Request("http://x", { method: "PATCH", body: JSON.stringify({ active: false }) }), { params: Promise.resolve({ id: "a2222222-2222-4222-8222-222222222222" }) });
    expect(response.status).toBe(200);
    expect(db.tables.profiles[0].active).toBe(false);
    const list = await (await listStudents()).json();
    expect(list.students).toEqual([expect.objectContaining({ email: "ana@x.com", active: false })]);
  });
  it("PATCH sem booleano: 400", async () => {
    const response = await patchStudent(new Request("http://x", { method: "PATCH", body: JSON.stringify({ active: "sim" }) }), { params: Promise.resolve({ id: "a2222222-2222-4222-8222-222222222222" }) });
    expect(response.status).toBe(400);
  });
});
