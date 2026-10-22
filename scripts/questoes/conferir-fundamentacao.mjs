// Confere data/fundamentacoes.json contra data/questoes.json: toda fundamentação aponta para uma questão
// existente, cita ao menos um dispositivo com texto e traz link de fonte oficial.
// Uso: node scripts/questoes/conferir-fundamentacao.mjs [--cobertura]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name) => JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8"));
const questions = read("questoes.json");
const file = read("fundamentacoes.json");
const byId = new Map(questions.map((question) => [question.id, question]));

// Só fonte oficial: texto de lei no Planalto, súmulas e julgados nos tribunais, tratados na OEA/ONU.
const OFFICIAL = [
  "planalto.gov.br", "stf.jus.br", "stj.jus.br", "senado.leg.br", "camara.leg.br", "cnj.jus.br",
  "tst.jus.br", "tse.jus.br", "defensoria.sp.def.br", "al.sp.gov.br", "oas.org", "ohchr.org", "un.org",
  "mpsp.mp.br", "condege.org.br", "gov.br",
];
const problems = [];
const push = (id, message) => problems.push(`${id}: ${message}`);

if (file.schema !== 1) problems.push("schema: esperado 1");
const entries = Object.entries(file.itens ?? {});
for (const [id, item] of entries) {
  if (!byId.has(id)) { push(id, "não existe em data/questoes.json"); continue; }
  if (typeof item.nota !== "string" || item.nota.trim().length < 15) push(id, "nota ausente ou muito curta");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.conferido ?? "")) push(id, "conferido deve ser AAAA-MM-DD");
  if (item.ressalva !== undefined && (typeof item.ressalva !== "string" || !item.ressalva.trim())) push(id, "ressalva vazia");
  const dispositivos = item.dispositivos;
  if (!Array.isArray(dispositivos) || dispositivos.length === 0) { push(id, "sem dispositivos"); continue; }
  for (const [index, dispositivo] of dispositivos.entries()) {
    const where = `dispositivo ${index + 1} (${dispositivo?.ref ?? "?"})`;
    if (!dispositivo?.ref?.trim()) push(id, `dispositivo ${index + 1}: ref vazia`);
    if (dispositivo?.tipo !== "lei" && dispositivo?.tipo !== "entendimento") { push(id, `${where}: tipo deve ser "lei" ou "entendimento"`); continue; }
    if (!dispositivo?.texto?.trim() || dispositivo.texto.trim().length < 20) push(id, `${where}: texto ausente ou muito curto`);
    // "lei" traz transcrição literal, e por isso a página oficial é obrigatória; "entendimento" é resumo, o link é opcional.
    if (dispositivo.tipo === "lei" && !dispositivo.url) { push(id, `${where}: tipo "lei" exige a url oficial da transcrição`); continue; }
    if (!dispositivo.url) continue;
    let host = "";
    try { host = new URL(dispositivo.url).hostname; } catch { push(id, `${where}: url inválida`); continue; }
    if (!OFFICIAL.some((domain) => host === domain || host.endsWith(`.${domain}`))) push(id, `${where}: ${host} não é fonte oficial`);
  }
  const refs = dispositivos.map((dispositivo) => dispositivo.ref);
  if (new Set(refs).size !== refs.length) push(id, "dispositivos repetidos (a tela usa a ref como chave)");
}

const missing = questions.filter((question) => !file.itens?.[question.id]);
if (process.argv.includes("--cobertura")) {
  const byDiscipline = new Map();
  for (const question of questions) {
    const row = byDiscipline.get(question.disciplina) ?? { total: 0, done: 0 };
    row.total += 1; if (file.itens?.[question.id]) row.done += 1;
    byDiscipline.set(question.disciplina, row);
  }
  for (const [discipline, row] of [...byDiscipline].sort()) console.log(`${row.done === row.total ? "✓" : " "} ${String(row.done).padStart(3)}/${String(row.total).padEnd(3)} ${discipline}`);
  for (const question of missing.slice(0, 40)) console.log(`  falta ${question.id} · ${question.disciplina}`);
}

console.log(`${entries.length} de ${questions.length} questões com fundamentação (${Math.round((100 * entries.length) / questions.length)}%).`);
if (problems.length) { console.error(`\n${problems.length} problema(s):`); for (const problem of problems) console.error(`  - ${problem}`); process.exit(1); }
console.log("Sem problemas.");
