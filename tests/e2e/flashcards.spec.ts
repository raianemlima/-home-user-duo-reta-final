import { expect, test, type Page } from "@playwright/test";

// Flashcards com o Supabase simulado (E2E_SUPABASE_MOCK=1): criar um cartão de lacuna a partir de um trecho do ebook
// e revisar o cartão vencido hoje.
const MOCK = Boolean(process.env.E2E_SUPABASE_MOCK);

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("E-mail da sua matrícula").fill("ana@duo.test");
  await page.getByLabel("Senha").fill("x");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/$/);
}

test("aluno cria um flashcard de lacuna a partir de um trecho do ebook", async ({ page }) => {
  test.skip(!MOCK, "Sem o Supabase simulado (E2E_SUPABASE_MOCK=1).");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/disciplinas/direito-penal/c0000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
  const paragraph = page.locator("[data-paragraph-id]").first();
  await paragraph.evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
  await page.getByRole("button", { name: "🃏 Flashcard" }).click();
  const sheet = page.getByRole("dialog", { name: "Novo flashcard" });
  const save = sheet.getByRole("button", { name: "Criar cartão" });
  await expect(save).toBeDisabled();
  await sheet.getByRole("button", { name: "típico" }).click();
  await expect(sheet.getByRole("button", { name: "típico" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText("1 palavra escondida.")).toBeVisible();
  const request = page.waitForRequest((item) => item.url().endsWith("/api/flashcards") && item.method() === "POST");
  await save.click();
  expect((await request).postDataJSON()).toMatchObject({ tipo: "lacuna", lacunas: [[13, 19]], start: { offset: 0 }, end: { offset: 40 } });
  await expect(page.getByText("Cartão criado ✓ Revise em Flashcards")).toBeVisible();
});

test("aluno revisa o cartão do dia no estilo Anki", async ({ page }) => {
  test.skip(!MOCK, "Sem o Supabase simulado (E2E_SUPABASE_MOCK=1).");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByRole("link", { name: /Flashcards: 1 cartão para revisar hoje/ })).toBeVisible();
  await page.getByRole("link", { name: /Flashcards: 1 cartão/ }).click();
  await expect(page.getByRole("heading", { name: "Flashcards" })).toBeVisible();
  await expect(page.getByText("para revisar hoje")).toBeVisible();
  await page.getByRole("button", { name: "Revisar agora" }).click();
  await expect(page.getByLabel("lacuna")).toHaveText("[ … ]");
  await page.getByRole("button", { name: "Mostrar resposta" }).click();
  await expect(page.locator("mark.flash-answer")).toHaveText("típico");
  await expect(page.getByRole("button", { name: /Bom\s*1 d/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fácil\s*4 d/ })).toBeVisible();
  await page.getByRole("button", { name: /Bom/ }).click();
  await expect(page.getByText("Revisão do dia concluída 🎉")).toBeVisible();
  await page.getByRole("button", { name: "Voltar aos cartões" }).click();
  await expect(page.getByText("Tudo em dia por hoje. ✓")).toBeVisible();
});
