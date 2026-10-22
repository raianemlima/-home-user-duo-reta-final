// Confere, contra a página oficial, cada dispositivo do tipo "lei" de data/fundamentacoes.json: todo trecho
// transcrito precisa estar, palavra por palavra, no texto da url citada (Planalto, em regra o texto compilado).
// Uso: node scripts/questoes/conferir-transcricao.mjs [pasta-de-cache] [--so=id1,id2] [--arquivo=outro.json]
// As páginas baixadas ficam na pasta de cache (padrão: .cache/leis), para não baixar de novo a cada rodada.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

const args = process.argv.slice(2);
const cacheDir = args.find((arg) => !arg.startsWith("--")) ?? join(process.cwd(), ".cache", "leis");
const only = args.find((arg) => arg.startsWith("--so="))?.slice(5).split(",");
mkdirSync(cacheDir, { recursive: true });
const source = args.find((arg) => arg.startsWith("--arquivo="))?.slice(10) ?? join(process.cwd(), "data", "fundamentacoes.json");
const file = JSON.parse(readFileSync(source, "utf8"));
// O Planalto recusa requisições sem cara de navegador.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const ENTITIES = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", ordm: "º", ordf: "ª", sect: "§", deg: "°", ndash: "–", mdash: "—", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…" };
const decode = (html, charset) => new TextDecoder(charset).decode(html);
function toText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<strike[\s\S]*?<\/strike>/gi, " ") // texto revogado aparece riscado no compilado
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}
// Compara sem depender de espaços, aspas, travessões, º/o, nem das notas "(Redação dada pela Lei…)" do compilado.
const normalize = (text) => text
  .normalize("NFC")
  .replace(/\((?:Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Revogad[oa]|Vide|Vig[êe]ncia|Acrescid[oa]|Renumerad[oa]|Promulga|Regulamento)[^)]*\)/gi, " ")
  .replace(/[“”«»"]/g, '"').replace(/[‘’`´]/g, "'").replace(/[–—−]/g, "-").replace(/[º°]/g, "o").replace(/ª/g, "a")
  .replace(/\s+/g, " ").replace(/ ([.,;:)])/g, "$1").replace(/\( /g, "(").replace(/(\d) o\b/g, "$1o").replace(/\bn o\b/g, "no").trim().toLowerCase();

async function page(url) {
  const path = join(cacheDir, `${createHash("sha1").update(url).digest("hex")}.txt`);
  if (existsSync(path)) return readFileSync(path, "utf8");
  // curl, e não fetch: respeita o proxy da máquina (HTTPS_PROXY) e o certificado configurado nele.
  const bytes = new Uint8Array(execFileSync("curl", ["-sSfL", "--max-time", "60", "-A", UA, "-H", "Accept: text/html", url], { maxBuffer: 64 * 1024 * 1024 }));
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 2048));
  // Algumas páginas do Planalto vêm em UTF-16 (com BOM); as demais declaram o charset no <meta>.
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : null;
  const charset = bom ?? /charset=["']?(utf-8|windows-1252|iso-8859-1)/i.exec(head)?.[1] ?? "windows-1252";
  const text = normalize(toText(decode(bytes, charset)));
  writeFileSync(path, text);
  return text;
}

const problems = [];
let checked = 0;
for (const [id, item] of Object.entries(file.itens)) {
  if (only && !only.includes(id)) continue;
  for (const dispositivo of item.dispositivos) {
    if (dispositivo.tipo !== "lei" || !dispositivo.url) continue;
    let text;
    try { text = await page(dispositivo.url.split("#")[0]); } catch (error) { problems.push(`${id} · ${dispositivo.ref}: não abriu ${dispositivo.url} (${error.message})`); continue; }
    checked += 1;
    // Cada linha da transcrição (caput, inciso, parágrafo) precisa estar na página; "[...]" marca supressão.
    for (const piece of dispositivo.texto.split(/\n|\[(?:\.\.\.|…)\]|\((?:\.\.\.|…)\)|…/).map(normalize).filter((piece) => piece.length >= 12)) {
      const bare = piece.replace(/^(art\. ?\d+[a-z-]*o?\.?|§ ?\d+o?\.?|par[áa]grafo [úu]nico\.?|[ivxlc]+ ?[-.)]|[a-z]\))\s*/i, "");
      if (!text.includes(piece) && !text.includes(bare)) problems.push(`${id} · ${dispositivo.ref}: trecho não encontrado na página — "${piece.slice(0, 90)}…"`);
    }
  }
}
console.log(`${checked} transcrições conferidas contra a página oficial.`);
if (problems.length) { console.error(`\n${problems.length} problema(s):`); for (const problem of problems) console.error(`  - ${problem}`); process.exit(1); }
console.log("Todas as transcrições batem com a página oficial.");
