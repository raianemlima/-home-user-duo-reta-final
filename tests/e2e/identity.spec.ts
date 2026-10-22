import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Tela pública: identidade e contraste nos dois temas, no celular e no PC.
for (const viewport of [{ name: "celular", width: 390, height: 844 }, { name: "pc", width: 1280, height: 800 }]) {
  for (const theme of ["light", "dark"] as const) {
    test(`login ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => { try { localStorage.setItem("duo-tema", value); } catch { /* sem armazenamento */ } }, theme);
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Entrar no app de estudo" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.screenshot({ path: `docs/prints/login-${viewport.name}-${theme}.png`, fullPage: true });
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test("privacidade abre sem sessão", async ({ page }) => {
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { name: "Privacidade" })).toBeVisible();
});
