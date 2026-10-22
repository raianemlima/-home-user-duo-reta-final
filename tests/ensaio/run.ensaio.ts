import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { it } from "vitest";
import { analyzeEbook, reanchorTrial } from "@/scripts/ensaio/analyze";

// Ensaio com os ebooks reais (que NÃO ficam no repositório). Uso:
//   ENSAIO_DIR=/pasta/ebooks [ENSAIO_BASE=base.pdf ENSAIO_NOVA=nova.pdf] [ENSAIO_OUT=relatorio.md] npm run ensaio
const dir = process.env.ENSAIO_DIR;
const out = process.env.ENSAIO_OUT ?? join(process.cwd(), "ensaio-relatorio.md");
const formatOf = (name: string) => (name.toLowerCase().endsWith(".docx") ? "docx" : "pdf") as "pdf" | "docx";

it.skipIf(!dir)("ensaio dos ebooks", async () => {
  const lines = ["| Arquivo | Seções | Parágrafos | DICA DUO | Resíduos | Sumário com seção |", "|---|---|---|---|---|---|"];
  const details: string[] = [];
  for (const name of readdirSync(dir as string).filter((file) => /\.(pdf|docx)$/i.test(file)).sort()) {
    const report = await analyzeEbook(new Uint8Array(readFileSync(join(dir as string, name))), formatOf(name));
    const coverage = report.tocEntries ? `${report.tocMatched}/${report.tocEntries} (${Math.round((100 * report.tocMatched) / report.tocEntries)}%)` : "sem sumário";
    lines.push(`| ${name} | ${report.sections} | ${report.paragraphs} | ${report.tips} | ${report.residual.length} | ${coverage} |`);
    if (report.residual.length || report.unmatchedToc.length) details.push(`### ${name}`, ...report.residual.slice(0, 5).map((text) => `- resíduo: ${text}`), ...report.unmatchedToc.slice(0, 15).map((text) => `- sumário sem seção: ${text}`));
  }
  if (process.env.ENSAIO_BASE && process.env.ENSAIO_NOVA) {
    const base = await analyzeEbook(new Uint8Array(readFileSync(process.env.ENSAIO_BASE)), formatOf(process.env.ENSAIO_BASE));
    const next = await analyzeEbook(new Uint8Array(readFileSync(process.env.ENSAIO_NOVA)), formatOf(process.env.ENSAIO_NOVA));
    const trial = reanchorTrial(base.draft, next.draft, 50, 42);
    lines.push("", `Atualização ${basename(process.env.ENSAIO_BASE)} → ${basename(process.env.ENSAIO_NOVA)}: ${trial.reanchored} de ${trial.total} grifos sorteados reancorados, ${trial.orphaned} órfãos (semente 42).`);
  }
  writeFileSync(out, [...lines, "", ...details, ""].join("\n"));
}, 900_000);
