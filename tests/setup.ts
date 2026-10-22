// Node 22 ainda não tem Promise.try, que o pdfjs-dist v6 usa. Polyfill apenas no ambiente de teste.
const promiseCtor = Promise as unknown as { try?: (fn: () => unknown) => Promise<unknown> };
if (typeof promiseCtor.try !== "function") {
  promiseCtor.try = (fn) => new Promise((resolve) => resolve(fn()));
}

// Fora do Next não há contexto de requisição para `after()`: nos testes, a tarefa roda na hora.
import { vi } from "vitest";
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (task: (() => unknown) | Promise<unknown>) => { void (typeof task === "function" ? task() : task); } }));
