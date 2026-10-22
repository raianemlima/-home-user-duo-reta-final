import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, makeFakeSupabase } from "../phase2/fake-supabase";

let db: FakeDb;
let current: string | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ ...makeFakeSupabase(db, current ?? "anon"), auth: { getUser: async () => ({ data: { user: current ? { id: current } : null }, error: null }) } }),
}));

import { requireStaff, requireStudent } from "@/lib/server/auth";

beforeEach(() => {
  db = new FakeDb();
  db.tables.profiles.push({ user_id: "eq", email: "e@duo", role: "equipe", active: true }, { user_id: "al", email: "a@duo", role: "aluno", active: true }, { user_id: "in", email: "i@duo", role: "aluno", active: false });
});

describe("papéis no servidor", () => {
  it("requireStaff aceita equipe e recusa aluno com 403", async () => {
    current = "eq"; await expect(requireStaff()).resolves.toMatchObject({ user: { id: "eq" } });
    current = "al"; await expect(requireStaff()).rejects.toMatchObject({ status: 403 });
  });
  it("requireStudent aceita aluno ativo e equipe; recusa inativo e sem perfil", async () => {
    current = "al"; await expect(requireStudent()).resolves.toMatchObject({ profile: { role: "aluno", active: true } });
    current = "eq"; await expect(requireStudent()).resolves.toMatchObject({ profile: { role: "equipe" } });
    current = "in"; await expect(requireStudent()).rejects.toMatchObject({ status: 403 });
    current = "zz"; await expect(requireStudent()).rejects.toMatchObject({ status: 403 });
  });
  it("sem sessão: 401", async () => {
    current = null; await expect(requireStudent()).rejects.toMatchObject({ status: 401 });
  });
});
