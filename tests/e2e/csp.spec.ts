import { expect, test, type Page } from "@playwright/test";

// Política de conteúdo (lib/csp.ts, aplicada no proxy): nenhuma tela pode ter script bloqueado, e HTML injetado não
// executa. As telas do aluno usam o Supabase simulado (tests/e2e/support/mock-supabase.mjs): rode com
// E2E_SUPABASE_MOCK=1 e o app construído com NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321, como faz a CI.
const MOCK = Boolean(process.env.E2E_SUPABASE_MOCK);

// Erros de console e violações da política; o 404 de uma API (ex.: aluno ainda sem cronograma) é resposta esperada.
async function watch(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !/status of 404/.test(message.text())) problems.push(`${page.url()}: ${message.text()}`); });
  page.on("pageerror", (error) => problems.push(`${page.url()}: ${error.message}`));
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (event) => console.error(`CSP bloqueou ${event.violatedDirective} ${event.blockedURI}`), true));
  return problems;
}

test("páginas públicas: política em toda resposta, nenhum script bloqueado, React ativo", async ({ page }) => {
  const problems = await watch(page);
  const response = await page.goto("/login", { waitUntil: "networkidle" });
  expect(response?.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  const enter = page.getByRole("button", { name: "Entrar" });
  await expect(enter).toBeDisabled();
  await page.getByLabel("Senha").fill("x");
  await expect(enter).toBeEnabled(); // só habilita com o React hidratado
  expect(await page.evaluate(() => [...document.querySelectorAll("script")].filter((script) => !script.nonce).length)).toBe(0);
  await page.goto("/privacidade", { waitUntil: "networkidle" });
  expect(problems).toEqual([]);
});

test("HTML injetado não executa e o app não abre dentro de outro site", async ({ page, browser, baseURL }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.innerHTML = `<iframe srcdoc="<script>parent.__srcdoc=1<\/script>"></iframe><img src="/nao-existe.png" onerror="window.__onerror=1"><a id="js" href="javascript:window.__jsurl=1">x</a>`;
    document.body.appendChild(box);
  });
  await page.click("#js");
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => [(window as { __srcdoc?: number }).__srcdoc, (window as { __onerror?: number }).__onerror, (window as { __jsurl?: number }).__jsurl])).toEqual([undefined, undefined, undefined]);

  const outsider = await browser.newPage();
  await outsider.route("http://outro-site.test/", (route) => route.fulfill({ contentType: "text/html", body: `<iframe src="${baseURL}/login"></iframe>` }));
  await outsider.goto("http://outro-site.test/");
  await outsider.waitForTimeout(1000);
  // Bloqueado, o quadro mostra a página de erro do navegador no lugar da tela de login.
  const framed = outsider.frames().find((frame) => frame !== outsider.mainFrame());
  expect(await framed?.getByRole("heading", { name: "Entrar no app de estudo" }).count().catch(() => 0) ?? 0).toBe(0);
  await outsider.close();
});

test("telas do aluno funcionam sem nenhum script bloqueado", async ({ page }) => {
  test.skip(!MOCK, "Sem o Supabase simulado (E2E_SUPABASE_MOCK=1): telas do aluno não verificadas.");
  const problems = await watch(page);
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("E-mail da sua matrícula").fill("ana@duo.test");
  await page.getByLabel("Senha").fill("senha-do-teste");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/$/);
  await expect(page.locator(".resume-card .resume-title")).toHaveText("Direito Penal");
  await expect(page.getByText("Meu cronograma de estudos")).toBeVisible();

  // Leitor: grifos carregados pela API, editor do grifo e navegação pelo sumário (no PC, fixo; no celular, gaveta).
  await page.goto("/disciplinas/direito-penal", { waitUntil: "networkidle" });
  await expect(page.locator("mark.hl").first()).toHaveText("Crime");
  await page.locator("mark.hl").first().click();
  await expect(page.getByRole("dialog", { name: "Editar grifo" })).toBeVisible();
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("link", { name: /PENAS/ }).first().click();
  await page.waitForURL(/c0000000-0000-4000-8000-000000000002/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "☰ Sumário" }).click();
  await expect(page.locator(".toc-close").first()).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto("/caderno", { waitUntil: "networkidle" });
  await expect(page.locator(".note-item blockquote").first()).toHaveText("Crime");
  await page.goto("/questoes", { waitUntil: "networkidle" });
  await page.locator(".q-card .q-alt").first().click();
  await expect(page.locator(".q-card .q-result").first()).toBeVisible();
  await page.goto("/vade-esperto", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Ler no app" })).toHaveAttribute("href", "/disciplinas/vade-esperto-codigo-penal");
  await page.goto("/cronograma", { waitUntil: "networkidle" });
  await expect(page.getByText("Escolha um cronograma ou envie o seu.")).toBeVisible();
  expect(problems).toEqual([]);
});
