import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// O app sobe com `npm run build && npm start` na porta 3100. No ambiente de desenvolvimento o Chromium já está em
// /opt/pw-browsers; na CI, vem de `npx playwright install chromium`.
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = process.env.PW_CHROMIUM ?? (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);
// E2E_SUPABASE_MOCK=1: sobe também o Supabase simulado das telas do aluno (tests/e2e/csp.spec.ts). O app precisa ter
// sido construído com NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321; as rotas com a chave de serviço leem a
// configuração ao rodar, por isso ela também vai aqui.
const mock = Boolean(process.env.E2E_SUPABASE_MOCK);
const MOCK_ENV = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "chave-publica-do-simulado", SUPABASE_SERVICE_ROLE_KEY: "chave-de-servico-do-simulado" };

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100", launchOptions: executablePath ? { executablePath } : {} },
  webServer: process.env.E2E_BASE_URL ? undefined : [
    ...(mock ? [{ command: "node tests/e2e/support/mock-supabase.mjs 54321", url: "http://127.0.0.1:54321/health", reuseExistingServer: true }] : []),
    { command: "npx next start -p 3100", url: "http://127.0.0.1:3100/login", reuseExistingServer: true, env: { NEXT_PUBLIC_PIPELINE_V2: "true", ...(mock ? MOCK_ENV : {}) } },
  ],
});
