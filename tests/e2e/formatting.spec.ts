import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Formatação do PDF no leitor (Supabase simulado, E2E_SUPABASE_MOCK=1): negrito, itálico sublinhado colorido, citação
// recuada e caixa; o grifo existente continua no lugar e uma seleção dentro do negrito dá as posições do texto.
const MOCK = Boolean(process.env.E2E_SUPABASE_MOCK);
const SECTION = "/disciplinas/direito-penal/c0000000-0000-4000-8000-000000000001";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("E-mail da sua matrícula").fill("ana@duo.test");
  await page.getByLabel("Senha").fill("x");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/$/);
}

test("negrito, itálico, sublinhado, cor, recuo e caixa do PDF; grifos e seleção intactos", async ({ page }) => {
  test.skip(!MOCK, "Sem o Supabase simulado (E2E_SUPABASE_MOCK=1).");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto(SECTION, { waitUntil: "networkidle" });
  const first = page.locator('[data-paragraph-id="b0000000-0000-4000-8000-000000000001"]');
  expect(await first.evaluate((element) => element.textContent)).toBe("Crime é fato típico, ilícito e culpável.");
  await expect(first.locator(".fx-b")).toHaveText("típico");
  await expect(first.locator(".fx-b")).toHaveCSS("font-weight", "700");
  const colored = first.locator(".fx-i.fx-u.fx-c");
  await expect(colored).toHaveText("ilícito");
  await expect(colored).toHaveCSS("font-style", "italic");
  await expect(colored).toHaveCSS("color", "rgb(26, 122, 60)");
  await expect(first.locator("mark.hl")).toHaveText("Crime");
  await expect(page.locator(".fx-indent-3")).toHaveCSS("padding-left", "38.25px"); // celular: no máximo 2,25 em
  await expect(page.locator(".fx-box")).toHaveCSS("background-color", "rgb(195, 253, 187)");
  // Seleção de "fato típico" (começa fora e termina dentro do negrito): as posições contam o texto, não as tags.
  const request = page.waitForRequest((item) => item.url().endsWith("/api/destaques") && item.method() === "POST");
  await first.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = []; for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
    const start = nodes.find((node) => node.data.includes("fato")) as Text, end = nodes.find((node) => node.data === "típico") as Text;
    const range = document.createRange(); range.setStart(start, start.data.indexOf("fato")); range.setEnd(end, 6);
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Importante" }).click();
  expect((await request).postDataJSON()).toMatchObject({ start: { offset: 8 }, end: { offset: 19 } });
});

for (const theme of ["light", "dark"] as const) test(`formatação legível no tema ${theme}`, async ({ page }) => {
  test.skip(!MOCK, "Sem o Supabase simulado (E2E_SUPABASE_MOCK=1).");
  await page.addInitScript((value) => { try { localStorage.setItem("duo-tema", value); } catch { /* sem armazenamento */ } }, theme);
  await login(page);
  await page.goto(SECTION, { waitUntil: "networkidle" });
  if (theme === "dark") await expect(page.locator(".fx-c").first()).not.toHaveCSS("color", "rgb(26, 122, 60)");
  const results = await new AxeBuilder({ page }).include(".section-text").withRules(["color-contrast"]).analyze();
  expect(results.violations).toEqual([]);
});
