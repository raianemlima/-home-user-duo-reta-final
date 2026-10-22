import { defineConfig } from "@playwright/test";

// Chromium já instalado no ambiente (/opt/pw-browsers). O app sobe com `npm run build && npm start` na porta 3100.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100", launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" } },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npx next start -p 3100", url: "http://127.0.0.1:3100/login", reuseExistingServer: true, env: { NEXT_PUBLIC_PIPELINE_V2: "true" } },
});
