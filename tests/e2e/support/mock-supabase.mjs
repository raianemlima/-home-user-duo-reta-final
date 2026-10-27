// Supabase simulado para o e2e das telas do aluno (tests/e2e/csp.spec.ts): login por senha com JWT ES256 + JWKS (o
// proxy confere o token como faria com o projeto real), REST com filtros básicos, RPC, storage e CORS. Dados fictícios,
// nada é gravado. Uso: node tests/e2e/support/mock-supabase.mjs [porta]
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.argv[2] || 54321);
const BASE = `http://127.0.0.1:${PORT}`;
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig", key_ops: ["verify"] };
const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

const U = "00000000-0000-4000-8000-0000000000aa", EMAIL = "ana@duo.test";
const D1 = "d0000000-0000-4000-8000-000000000001", D2 = "d0000000-0000-4000-8000-000000000002";
const V1 = "e0000000-0000-4000-8000-000000000001", V2 = "e0000000-0000-4000-8000-000000000002";
const S1 = "c0000000-0000-4000-8000-000000000001", S2 = "c0000000-0000-4000-8000-000000000002", S3 = "c0000000-0000-4000-8000-000000000003";
const P1 = "b0000000-0000-4000-8000-000000000001";
const now = new Date().toISOString();
const tables = {
  profiles: [{ user_id: U, email: EMAIL, name: "Ana", role: "aluno", active: true, must_change_password: false }],
  disciplines: [{ id: D1, slug: "direito-penal", title: "Direito Penal", position: 1 }, { id: D2, slug: "vade-esperto-codigo-penal", title: "Vade Esperto – Código Penal", position: 2 }],
  content_versions: [
    { id: V1, discipline_id: D1, label: "Atualizado em 21/10/2026", status: "published", published_at: "2026-10-21T12:00:00Z", source_path: "u/penal.pdf", source_file_name: "Penal.pdf" },
    { id: V2, discipline_id: D2, label: "Atualizado em 14/09/2026", status: "published", published_at: "2026-09-14T12:00:00Z", source_path: "u/cp.docx", source_file_name: "CP.docx" },
  ],
  sections: [
    { id: S1, version_id: V1, position: 1, level: 1, numbering: "1", title: "CRIMES", path: [] },
    { id: S2, version_id: V1, position: 2, level: 1, numbering: "2", title: "PENAS", path: [] },
    { id: S3, version_id: V2, position: 1, level: 1, numbering: "Art. 1º", title: null, path: [] },
  ],
  paragraphs: [
    { id: P1, section_id: S1, version_id: V1, position: 1, kind: "body", text: "Crime é fato típico, ilícito e culpável.", hash: "a" },
    { id: "b0000000-0000-4000-8000-000000000002", section_id: S1, version_id: V1, position: 2, kind: "tip", text: "DICA DUO cai muito na prova.", hash: "b" },
    { id: "b0000000-0000-4000-8000-000000000003", section_id: S2, version_id: V1, position: 1, kind: "body", text: "A pena é a consequência do crime. ".repeat(60), hash: "c" },
    { id: "b0000000-0000-4000-8000-000000000004", section_id: S3, version_id: V2, position: 1, kind: "body", text: "Art. 1º Não há crime sem lei anterior que o defina.", hash: "d" },
  ],
  highlights: [{ id: "a0000000-0000-4000-8000-000000000001", user_id: U, discipline_id: D1, version_id: V1, start_paragraph_id: P1, start_offset: 0, end_paragraph_id: P1, end_offset: 5, quote: "Crime", prefix: "", suffix: " é fato", color: "importante", note: "Conceito analítico", status: "active", orphaned_at: null, reviewed_at: null }],
  reading_positions: [{ user_id: U, discipline_id: D1, section_id: S1, updated_at: now }],
  question_answers: [], study_plan_choices: [], push_subscriptions: [],
  vade_esperto: [{ slug: "penal", versao: "atualizado em 14.09.26", updated_at: now }],
};

function token() {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "ES256", typ: "JWT", kid: "k1" });
  const payload = b64({ sub: U, email: EMAIL, role: "authenticated", aud: "authenticated", iss: `${BASE}/auth/v1`, iat, exp: iat + 3600, session_id: "s1", aal: "aal1" });
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${header}.${payload}.${signature}`;
}
const user = () => ({ id: U, aud: "authenticated", role: "authenticated", email: EMAIL, app_metadata: { provider: "email" }, user_metadata: {}, created_at: now, last_sign_in_at: now });
const session = () => ({ access_token: token(), refresh_token: "r1", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user() });

function matches(row, key, raw) {
  const at = raw.indexOf("."); const op = raw.slice(0, at); const value = raw.slice(at + 1);
  const cell = row[key];
  if (op === "eq") return String(cell) === value;
  if (op === "neq") return String(cell) !== value;
  if (op === "is") return value === "null" ? cell == null : String(cell) === value;
  if (op === "in") return value.replace(/^\(|\)$/g, "").split(",").map((item) => item.replace(/^"|"$/g, "")).includes(String(cell));
  if (op === "like" || op === "ilike") return new RegExp(`^${value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*")}$`, op === "ilike" ? "i" : "").test(String(cell));
  return true;
}
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const body = await new Promise((resolve) => { let data = ""; req.on("data", (chunk) => { data += chunk; }); req.on("end", () => resolve(data)); });
  res.setHeader("access-control-allow-origin", req.headers.origin || "*");
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] || "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("access-control-expose-headers", "content-range");
  const send = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(value === undefined ? "" : JSON.stringify(value)); };
  if (req.method === "OPTIONS") return send(204);
  if (url.pathname === "/health") return send(200, { ok: true });
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return send(200, { keys: [jwk] });
  if (url.pathname === "/auth/v1/token") return send(200, session());
  if (url.pathname === "/auth/v1/user") return send(200, user());
  if (url.pathname === "/auth/v1/logout") return send(204);
  if (url.pathname.startsWith("/rest/v1/rpc/")) return send(200, true);
  if (url.pathname.startsWith("/storage/v1/object/list/")) return send(200, []);
  if (url.pathname.startsWith("/storage/v1/")) return send(404, { statusCode: "404", error: "not_found", message: "Object not found" });
  const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
  if (!table) return send(404, { message: "rota desconhecida" });
  if (req.method !== "GET") {
    const rows = body ? [].concat(JSON.parse(body)) : [];
    return send(req.method === "DELETE" ? 200 : 201, (req.headers.prefer || "").includes("return=representation") ? rows : undefined);
  }
  let rows = (tables[table] || []).filter((row) => [...url.searchParams].every(([key, raw]) => RESERVED.has(key) || matches(row, key, raw)));
  const offset = Number(url.searchParams.get("offset") || 0), limit = url.searchParams.get("limit");
  rows = rows.slice(offset, limit ? offset + Number(limit) : undefined);
  if ((req.headers.accept || "").includes("vnd.pgrst.object")) return rows.length === 1 ? send(200, rows[0]) : send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
  return send(200, rows);
});
server.listen(PORT, "127.0.0.1", () => console.log(`mock em ${BASE}`));
