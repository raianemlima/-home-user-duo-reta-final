import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// Fluxo real do aluno contra um projeto Supabase de DESENVOLVIMENTO (nunca produção).
// Requer: E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY e o app rodando com esse projeto (E2E_BASE_URL).
const url = process.env.E2E_SUPABASE_URL, serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
test.skip(!url || !serviceKey || !process.env.E2E_BASE_URL, "Sem Supabase de desenvolvimento configurado: fluxo do aluno não executado (defina E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY e E2E_BASE_URL).");

test("aluno entra com e-mail e senha, grifa no celular, vê no caderno e exporta o PDF", async ({ page }) => {
  const admin = createClient(url as string, serviceKey as string, { auth: { persistSession: false } });
  const email = `e2e-${Date.now()}@exemplo.com`;
  const password = "e2e-senha-123";
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = created.user?.id as string;
  await admin.from("profiles").insert({ user_id: userId, email, role: "aluno", active: true });
  const slug = `e2e-${Date.now()}`;
  const { data: discipline } = await admin.from("disciplines").insert({ slug, title: "Disciplina E2E", position: 999 }).select("id").single();
  const { data: version } = await admin.from("content_versions").insert({ discipline_id: discipline?.id, label: "E2E", source_sha256: "e2e", status: "published", published_at: new Date().toISOString() }).select("id").single();
  const { data: section } = await admin.from("sections").insert({ version_id: version?.id, position: 1, level: 1, numbering: "1", title: "MODELOS", path: [] }).select("id").single();
  await admin.from("paragraphs").insert({ section_id: section?.id, version_id: version?.id, position: 1, kind: "body", text: "O modelo judicare paga advogados particulares.", hash: "e2e" });

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel("E-mail da sua matrícula").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("link", { name: /Disciplina E2E/ }).click();

    const paragraph = page.locator("[data-paragraph-id]").first();
    await paragraph.evaluate((element) => { const text = element.querySelector("span")?.firstChild as Text; const range = document.createRange(); range.setStart(text, 2); range.setEnd(text, 17); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
    await page.getByRole("button", { name: "Importante" }).click();
    await expect(page.locator("mark.hl")).toHaveText("modelo judicare");

    await page.goto("/caderno");
    await expect(page.getByText("modelo judicare")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar caderno (PDF)" }).click();
    expect((await download).suggestedFilename()).toMatch(/^caderno-duo-\d{4}-\d{2}-\d{2}\.pdf$/);
  } finally {
    await admin.from("disciplines").delete().eq("id", discipline?.id);
    await admin.auth.admin.deleteUser(userId);
  }
});
