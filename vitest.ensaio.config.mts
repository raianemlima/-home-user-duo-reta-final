import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.mts";

// Ensaio manual com arquivos reais: fora da suíte padrão (npm test).
export default mergeConfig(base, defineConfig({ test: { include: ["tests/ensaio/**/*.ensaio.ts"], testTimeout: 900_000 } }));
