# App DUO Reta Final DPE-SP — V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a V1 do app de estudo do Cursos DUO: alunos convidados leem os ebooks do Reta Final DPE-SP, grifam,
anotam, revisam num caderno e exportam o caderno em PDF com a identidade DUO; a equipe publica e atualiza os ebooks sem
perder os grifos.

**Architecture:** Repositório novo derivado do `atelie-do-conhecimento` (Next.js App Router + Supabase com RLS). A
ingestão reaproveita o motor de etapas do atelie (extrair → limpar em modo fiel → segmentar) e grava uma versão
imutável de conteúdo (seções + parágrafos com hash). Grifos são âncoras (posição + trecho + contexto) reancoradas por
uma função pura a cada publicação. A exportação passa por um modelo de documento neutro (`ExportDoc`) e um renderizador
PDF (`@react-pdf/renderer`).

**Tech Stack:** Node 22, Next.js, React, TypeScript strict, Supabase (`@supabase/ssr`, `@supabase/supabase-js`),
`pdfjs-dist`, `jszip`, `@react-pdf/renderer`, `@fontsource/montserrat`, `@fontsource/inter`, Vitest, Playwright
(Chromium em `/opt/pw-browsers`), Postgres 16 local para testes de banco.

**Spec:** `docs/superpowers/specs/2026-10-22-app-duo-reta-final-design.md`

## Global Constraints

- Toda a interface e as mensagens em português do Brasil.
- Nenhuma dependência, rota, variável ou código de IA (nada de `ANTHROPIC_API_KEY`, `lib/ai`, `lib/drafting`).
- `SUPABASE_SERVICE_ROLE_KEY` só em módulos com `import "server-only"`; `findLeakedSecretNames` continua valendo.
- Os ebooks do DUO **nunca** são versionados no repositório (direitos autorais); testes usam fixtures sintéticos.
- Texto do material nunca é reescrito: só ruído de diagramação sai (perfil fiel, Task 2).
- Cores de grifo (chave → rótulo): `importante` → "Importante" (amarelo), `lei_seca` → "Lei seca" (verde),
  `jurisprudencia` → "Jurisprudência" (azul), `revisar` → "Revisar" (rosa).
- Contexto da âncora: 32 caracteres antes (`prefix`) e 32 depois (`suffix`).
- Uma única versão `published` por disciplina.
- Login: mensagem única e neutra para qualquer e-mail: "Se este e-mail estiver cadastrado no curso, você receberá um
  link e um código de acesso."
- Rodapé do PDF exportado: `Cursos DUO · Reta Final DPE-SP · uso pessoal de <e-mail>`.
- Tokens de cor (`app/theme.css`): `--duo-ink #29343A`, `--duo-green #31BF5D`, `--duo-teal #375963`,
  `--duo-terracotta #AE4941`, `--duo-paper #F4F5F0`.
- Versões de dependência fixadas (sem `latest`) no `package.json`.
- Estilo de código: o do atelie (componentes densos, comentários curtos em português, sem ponto e vírgula faltando).

## Review Focus

1. **Trecho repetido** ("Súmula Vinculante", "art. 5º") aparece várias vezes na seção: a reancoragem nunca prende o
   grifo no lugar errado; sem desempate pelo contexto, fica órfão. → Task 4, `reanchor ambiguous`.
2. **Seleção no celular** começando ou terminando no meio de palavra, dentro de tabela ou de "DICA DUO": o grifo
   salva exatamente o texto selecionado e reaparece igual ao recarregar. → Task 10, testes de `rangeToAnchor`.
3. **Lista de e-mails suja** (maiúsculas, espaços, `;`, duplicados, linhas inválidas, aluno já cadastrado): normaliza,
   não convida duas vezes, relata inválidos. → Task 6, `parseStudentList`.
4. **Aluno desativado com sessão aberta**: perde acesso ao conteúdo na próxima requisição, sem esperar o token
   expirar. → Task 3, asserção de RLS `inactive student`.
5. **Publicar duas vezes / clique duplo em "Publicar"**: continua existindo uma única versão publicada e a
   reancoragem roda uma vez. → Task 3 (índice único) e Task 5 (`publishVersion` idempotente).

---

### Task 1: Repositório base a partir do atelie

**Files:**
- Create: `/home/user/duo-reta-final/*` (cópia do atelie, sem `.git`, preservando `docs/superpowers/`)
- Delete: `lib/ai`, `lib/drafting`, `lib/verification`, `lib/study-guide`, `lib/backup.ts`, `lib/local-store.ts`,
  `lib/text-cleaner.ts`, `lib/document-store.ts`, `lib/supabase/data-store.ts`, `lib/supabase/legacy-migration.ts`,
  `app/projetos`, `app/fontes`, `app/materiais`, `app/dados`, `app/documentos`,
  `components/{Data,Material,Project,Source}Workspace.tsx`, `components/ThematicMapPanel.tsx`,
  `tests/phase6`, `tests/phase7`, `tests/phase8`, `tests/study-guide`, `docs/relatorios`
- Modify: `lib/pipeline/handlers.ts` (remover `draftingHandler`, `verificationHandler`, `AI_HANDLERS`),
  `lib/pipeline/types.ts` (remover `draftStore` e `ai` de `PipelineDeps`), `lib/server/env.ts` (remover
  `anthropicApiKey`), `package.json` (nome `duo-reta-final`, versões fixas), `README.md`, `.env.example`

**Interfaces:**
- Produces: projeto que compila, com `lib/extraction`, `lib/cleaning`, `lib/segmentation`, `lib/pipeline`,
  `lib/thematic`, `lib/citations`, `lib/server/*`, `lib/supabase/{client,server,config,secure-documents}.ts`,
  `proxy.ts`, `app/login`, `app/configuracao`, `app/api/{documents,jobs,notebooks}`.

- [ ] **Step 1:** `rsync -a --exclude .git --exclude node_modules /home/user/raianemlima/atelie-do-conhecimento/ /home/user/duo-reta-final/` e conferir que `docs/superpowers/` continua lá.
- [ ] **Step 2:** Apagar a lista acima; remover importações mortas até `npx tsc --noEmit` passar. Arquivos que só
  existiam para telas removidas (ex.: `lib/document-extractor.ts`, `lib/document-import.ts`) saem se `tsc` e `eslint`
  confirmarem que ninguém os usa.
- [ ] **Step 3:** `npm install`; trocar todo `latest` do `package.json` pela versão instalada (`npm ls --depth=0`).
- [ ] **Step 4:** Verificar: `npm test && npx tsc --noEmit && npm run lint`. Esperado: tudo verde (testes das fases
  1–5 continuam passando).
- [ ] **Step 5:** README curto: o que é o app, como rodar, variáveis (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), origem no atelie. `.env.example` sem chaves de IA.
- [ ] **Step 6:** Commit `chore: base do app DUO a partir do atelie`.

### Task 2: Limpeza em modo fiel com o ruído do DUO

**Files:**
- Modify: `lib/cleaning/clean.ts`, `lib/segmentation/types.ts` (`SegmentParagraph.kind` aceita `"tip"`), `lib/segmentation/segment.ts`, `lib/pipeline/handlers.ts`, `lib/pipeline/types.ts`
- Modify: `tests/golden/generate_corpus.py` (novo PDF `19-duo-ebook.pdf`)
- Test: `tests/duo/faithful-cleaning.test.ts`

**Interfaces:**
- Produces: `CleanOptions.mode?: "faithful" | "default"`; `CleanParagraph.kind` passa a aceitar `"tip"`;
  `PipelineDeps.cleaningMode?: "faithful"`; `export const DUO_HANDLERS: StageHandler[] = [extractionHandlerV2, cleaningHandlerV2, segmentationHandler]`.

- [ ] **Step 1: Fixture.** Em `generate_corpus.py`, gerar `19-duo-ebook.pdf` (4 páginas) imitando o ebook:
  cabeçalho "EBOOK DE RETA FINAL" em toda página; rodapé "Cursos DUO · Extensivo Inteligente · Atualizado em
  29/07/2026 Página N"; página 1 com "Sumário" e linhas pontilhadas; títulos numerados ("1. MODELOS DE ASSISTÊNCIA",
  "1.1 Critérios…"); um parágrafo com "conforme a aula 3, a Defensoria…" e um com "www.planalto.gov.br"; uma caixa
  iniciada por "DICA DUO Como usar este material". Rodar `npm run corpus`.
- [ ] **Step 2: Testes que falham** em `tests/duo/faithful-cleaning.test.ts`:
  - `faithful mode removes running header, footer and page numbers`: nenhum parágrafo contém "EBOOK DE RETA FINAL",
    "Extensivo Inteligente" nem "Página".
  - `faithful mode keeps every content sentence`: os textos "conforme a aula 3, a Defensoria" e
    "www.planalto.gov.br" continuam presentes literalmente.
  - `DICA DUO paragraph becomes kind tip`: o parágrafo que começa com "DICA DUO" tem `kind === "tip"`.
  - `default mode unchanged`: `cleanDocument(x)` sem `mode` produz o mesmo resultado de antes (snapshot existente em
    `tests/characterization` continua verde).
- [ ] **Step 3:** Rodar `npx vitest run tests/duo/faithful-cleaning.test.ts`. Esperado: FAIL.
- [ ] **Step 4: Implementar.** Em `cleanDocument`, com `mode: "faithful"`: manter a remoção de cabeçalho/rodapé
  repetidos e de `page_number`; **não** aplicar `cleanText` (regras inline e de sentença) — o texto só passa por
  `collapseSpaces`; parágrafo de corpo que começa com `/^DICA DUO\b/` vira `kind: "tip"`. Subir `CLEANER_VERSION` para
  `"5"`. `cleaningHandlerV2` repassa `deps.cleaningMode` e inclui o modo no `inputKey`.
- [ ] **Step 5:** `npm test` inteiro. Esperado: PASS.
- [ ] **Step 6:** Commit `feat: limpeza em modo fiel para o material do DUO`.

### Task 3: Esquema do app (migração 0009) e RLS

**Files:**
- Create: `supabase/migrations/0009_duo_core.sql`, `supabase/migrations/0009_duo_core.down.sql`
- Create: `tests/db/assertions-duo.sql`
- Modify: `tests/db/verify.sh` (aplicar 0008 e 0009 e rodar `assertions-duo.sql`)

**Interfaces:**
- Produces (tabelas, todas em `public`, com RLS ligada):
  - `profiles(user_id uuid pk → auth.users, email text unique not null, name text not null default '', role text check in ('equipe','aluno') default 'aluno', active boolean default true, created_at)`
  - `disciplines(id uuid pk, slug text unique, title text, position int)`
  - `content_versions(id uuid pk, discipline_id → disciplines, label text, source_sha256 text, job_id uuid null, status text check in ('draft','published','archived'), created_at, published_at timestamptz null)` + `unique index one_published_per_discipline on (discipline_id) where status = 'published'`
  - `sections(id uuid pk, version_id → content_versions on delete cascade, position int, level int, numbering text null, title text null, path text[])`
  - `paragraphs(id uuid pk, section_id → sections on delete cascade, version_id → content_versions on delete cascade, position int, kind text check in ('body','table','footnote','tip'), text text, hash text)`
  - `highlights(id uuid pk, user_id uuid default auth.uid() → auth.users, discipline_id, version_id, start_paragraph_id uuid, start_offset int, end_paragraph_id uuid, end_offset int, quote text, prefix text, suffix text, color text check in ('importante','lei_seca','jurisprudencia','revisar'), note text null check (char_length(note) <= 2000), status text check in ('active','orphaned') default 'active', orphaned_at timestamptz null, reviewed_at timestamptz null, created_at, updated_at)`
  - `reading_positions(user_id, discipline_id, section_id, updated_at, primary key (user_id, discipline_id))`
  - Funções `security definer stable`: `public.is_staff() returns boolean`, `public.is_active_student() returns boolean` (true para aluno **ou** equipe com `active`).
- Políticas: conteúdo (`disciplines`, versões `published`, suas `sections`/`paragraphs`) legível com
  `is_active_student()`; tudo de conteúdo escrito só por `is_staff()`; `highlights` e `reading_positions` só
  `user_id = auth.uid() and is_active_student()`; `profiles`: o próprio lê, equipe lê e altera todos.

- [ ] **Step 1: Asserções que falham** em `tests/db/assertions-duo.sql` (padrão de `tests/db/assertions.sql`,
  trocando `request.jwt.claim.sub` e `set role authenticated`):
  - `student reads published only`: aluno ativo vê 1 versão publicada e 0 rascunhos.
  - `student isolation`: aluno A não lê nem altera grifo de B.
  - `inactive student`: com `profiles.active = false`, o mesmo usuário passa a ler 0 parágrafos e 0 grifos próprios.
  - `user without profile`: usuário em `auth.users` sem linha em `profiles` lê 0 de tudo.
  - `single published`: segundo `update … set status='published'` na mesma disciplina falha.
  - `student cannot write content` e `student cannot promote self` (`update profiles set role='equipe'` falha).
- [ ] **Step 2:** Rodar `tests/db/verify.sh` contra Postgres descartável (initdb em `/tmp/pgtest`). Esperado: FAIL
  (migração não existe).
- [ ] **Step 3:** Escrever `0009_duo_core.sql` e o `.down.sql` (que remove só o que a 0009 criou).
- [ ] **Step 4:** Rodar `tests/db/verify.sh`. Esperado: todas as linhas `OK`, incluindo aplicar → reverter → aplicar.
- [ ] **Step 5:** Commit `feat: esquema de conteúdo, grifos e alunos com RLS`.

### Task 4: Âncoras e reancoragem (funções puras)

**Files:**
- Create: `lib/highlights/types.ts`, `lib/highlights/normalize.ts`, `lib/highlights/anchor.ts`, `lib/highlights/reanchor.ts`
- Test: `tests/duo/anchor.test.ts`, `tests/duo/reanchor.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type HighlightColor = "importante" | "lei_seca" | "jurisprudencia" | "revisar";
  export const HIGHLIGHT_COLORS: { key: HighlightColor; label: string; swatch: string }[];
  export type ParagraphRef = { id: string; sectionId: string; sectionPath: string[]; position: number; hash: string; text: string };
  export type VersionText = { paragraphs: ParagraphRef[] }; // ordenados por seção e posição
  export type Point = { paragraphId: string; offset: number };
  export type Anchor = { start: Point; end: Point; quote: string; prefix: string; suffix: string };
  export type ReanchorResult = { highlightId: string; status: "active"; anchor: Anchor } | { highlightId: string; status: "orphaned" };
  export const CONTEXT_CHARS = 32;
  export function normalizeWithMap(text: string): { text: string; map: number[] } // map[i] = índice original do caractere normalizado i
  export function createAnchor(doc: VersionText, start: Point, end: Point): Anchor // lança se start/end em seções diferentes ou intervalo vazio
  export function reanchor(highlights: { id: string; anchor: Anchor }[], oldDoc: VersionText, newDoc: VersionText): ReanchorResult[]
  ```
- Convenção: o texto "achatado" de um conjunto de parágrafos junta `text` com `"\n"`; offsets são índices UTF-16 em
  `ParagraphRef.text`; `end.offset` é exclusivo.

- [ ] **Step 1: Testes que falham** (`anchor.test.ts`):
  - `quote spans two paragraphs`: início no meio do parágrafo 1 e fim no 2 → `quote` = fim de p1 + `"\n"` + começo de p2.
  - `prefix and suffix are 32 chars clipped at document edges`.
  - `rejects cross-section and empty ranges`.
  - `normalizeWithMap unifies quotes, dashes and whitespace` (`“a”  –  b` → `"a" - b`, com `map` correto).
- [ ] **Step 2: Testes que falham** (`reanchor.test.ts`), cada um com duas `VersionText` montadas à mão:
  - `same hash keeps offsets` (parágrafo mudou de posição, mesmo hash → mesmos offsets, novo `paragraphId`).
  - `edited paragraph, quote still present → reanchored in same section path`.
  - `quote moved to another section → found in whole discipline`.
  - `ambiguous`: trecho aparece 2× na seção; o contexto desempata → âncora certa; com contexto também igual → `orphaned`.
  - `removed quote → orphaned`.
  - `quote with curly quotes in new version still matches` (normalização).
- [ ] **Step 3:** `npx vitest run tests/duo/anchor.test.ts tests/duo/reanchor.test.ts`. Esperado: FAIL.
- [ ] **Step 4: Implementar.** Algoritmo de `reanchor`, por grifo:
  1. Se existem em `newDoc` parágrafos com o hash dos parágrafos de início e de fim do `oldDoc`, na mesma ordem e
     seção → mesmos offsets nos novos ids.
  2. Senão, buscar `normalize(quote)` no texto normalizado da seção de mesmo `sectionPath` (comparação por
     `join(" › ")`); se 0 resultados, no texto da disciplina inteira.
  3. 1 ocorrência → âncora. Várias → pontuar cada uma por igualdade do `prefix` e do `suffix` normalizados
     (comprimento do maior sufixo/prefixo comum); ganha a maior pontuação **única**; empate → `orphaned`.
  4. Converter o índice normalizado para original via `map`, depois para `Point` por parágrafo. Recalcular
     `prefix`/`suffix` no novo texto; `quote` permanece o original salvo.
- [ ] **Step 5:** Rodar os dois arquivos. Esperado: PASS.
- [ ] **Step 6:** Commit `feat: âncoras de grifo e reancoragem determinística`.

### Task 5: Versões de conteúdo — rascunho a partir do job e publicação

**Files:**
- Create: `lib/content/build.ts`, `lib/content/repository.ts`, `lib/server/admin.ts`
- Create: `app/api/equipe/versoes/route.ts`, `app/api/equipe/versoes/[id]/publicar/route.ts`, `app/api/equipe/versoes/[id]/route.ts`
- Modify: `lib/server/auth.ts`, `app/api/jobs/route.ts`, `app/api/documents/*/route.ts`
- Test: `tests/duo/content-build.test.ts`, `tests/duo/publish.test.ts`

**Interfaces:**
- Consumes: `SegmentationResult` (`lib/segmentation/types.ts`), `DUO_HANDLERS` (Task 2), `reanchor`/`VersionText` (Task 4).
- Produces:
  ```ts
  // lib/content/build.ts
  export type DraftSection = { position: number; level: number; numbering: string | null; title: string | null; path: string[]; paragraphs: { position: number; kind: "body" | "table" | "footnote" | "tip"; text: string; hash: string }[] };
  export function buildDraft(segmentation: SegmentationResult): DraftSection[] // ignora seções `container` sem parágrafos; hash = sha256(normalizeWithMap(text).text)
  // lib/server/auth.ts
  export async function requireStaff(): Promise<{ supabase: SupabaseClient; user: User }> // 403 "Acesso restrito à equipe."
  export async function requireStudent(): Promise<{ supabase: SupabaseClient; user: User; profile: { role: "equipe" | "aluno"; active: boolean } }> // 403 se inativo/sem perfil
  // lib/server/admin.ts  (import "server-only"; cliente com SUPABASE_SERVICE_ROLE_KEY)
  export function createAdminClient(): SupabaseClient
  // lib/content/repository.ts
  export async function saveDraft(supabase: SupabaseClient, input: { disciplineId: string; label: string; sourceSha256: string; jobId: string; sections: DraftSection[] }): Promise<{ versionId: string }>
  export async function loadVersionText(supabase: SupabaseClient, versionId: string): Promise<VersionText>
  export async function publishVersion(admin: SupabaseClient, versionId: string): Promise<{ published: true; alreadyPublished: boolean; reanchored: number; orphaned: number }>
  ```
- Rotas (todas `requireStaff`):
  - `POST /api/equipe/versoes` `{ disciplineId, jobId, label }` → lê a saída `segmentation` do job concluído e chama `buildDraft` + `saveDraft` → `201 { versionId }`.
  - `POST /api/equipe/versoes/[id]/publicar` → `publishVersion`.
  - `DELETE /api/equipe/versoes/[id]` → só `draft`; outro status → `409`.
- `app/api/jobs` e `app/api/documents/*` passam a exigir `requireStaff` e a usar `DUO_HANDLERS` com `cleaningMode: "faithful"`.

- [ ] **Step 1: Testes que falham** (`content-build.test.ts`, usando `extractCorpus("19-duo-ebook.pdf")` → `cleanDocument(…, { mode: "faithful" })` → `segmentDocument`):
  - `sections follow the ebook numbering` (títulos "1. MODELOS…" e "1.1 Critérios…" com `level` crescente).
  - `table of contents is not a section`.
  - `tip paragraph kept with kind tip`.
  - `hash is stable across whitespace differences`.
- [ ] **Step 2: Testes que falham** (`publish.test.ts`, com `FakeDb`/`makeFakeSupabase` de `tests/phase2/fake-supabase.ts`, estendido se faltar algum método):
  - `publish archives previous and reanchors highlights` (1 grifo reancorado, 1 órfão com `orphaned_at` preenchido).
  - `publishing twice is idempotent` (segunda chamada → `alreadyPublished: true`, reancoragem não roda de novo).
  - `cannot delete a published version` (409).
  - `student calling staff route gets 403`.
- [ ] **Step 3:** Rodar os dois arquivos. Esperado: FAIL.
- [ ] **Step 4: Implementar.** `publishVersion`: se a versão já é `published`, retorna cedo; senão carrega a anterior
  publicada, marca-a `archived`, marca a nova `published` com `published_at = now()`, carrega os grifos `active` da
  disciplina presos à anterior, roda `reanchor` e grava em lote (`status`, offsets, `version_id`, `orphaned_at`).
- [ ] **Step 5:** `npm test`. Esperado: PASS.
- [ ] **Step 6:** Commit `feat: rascunho e publicação de versões com reancoragem`.

### Task 6: Alunos — lista de e-mails, convites e desativação

**Files:**
- Create: `lib/students/parse.ts`, `app/api/equipe/alunos/route.ts`, `app/api/equipe/alunos/[id]/route.ts`
- Test: `tests/duo/students.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ParsedStudentList = { valid: { email: string; name: string }[]; invalid: string[]; duplicates: string[] };
  export function parseStudentList(raw: string): ParsedStudentList // separadores: quebra de linha, vírgula, ponto e vírgula, tab; aceita "Nome <email>" e "email"; e-mail em minúsculas e sem espaços
  export const MAX_STUDENTS_PER_BATCH = 500;
  ```
- `POST /api/equipe/alunos` `{ list: string }` → para cada válido: se já existe em `profiles`, reativa e não convida;
  senão `admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/confirm` })` e cria `profiles`
  (`role 'aluno'`). Resposta `{ invited: string[]; reactivated: string[]; invalid: string[]; duplicates: string[]; failed: { email: string; reason: string }[] }`.
- `PATCH /api/equipe/alunos/[id]` `{ active: boolean }`. `GET /api/equipe/alunos` lista perfis.

- [ ] **Step 1: Testes que falham:**
  - `parseStudentList normalizes case and spaces` (`" Ana@Exemplo.com "` → `ana@exemplo.com`).
  - `mixed separators and "Nome <email>"`.
  - `reports invalid lines and duplicates`.
  - `rejects batch above 500` (rota → 400).
  - `existing student is reactivated, not re-invited` (FakeDb + admin falso que registra chamadas de convite).
  - `invite failure is reported per email and does not abort the batch`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar `parseStudentList` e as rotas (`requireStaff`; convites com `createAdminClient`).
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: cadastro de alunos por lista de e-mails`.

### Task 7: Login por link mágico/código e papéis no proxy

**Files:**
- Modify: `app/login/page.tsx`, `proxy.ts`
- Create: `app/auth/confirm/route.ts`
- Test: `tests/duo/proxy.test.ts`

**Interfaces:**
- Consumes: `requireStudent`/`requireStaff` (Task 5).
- Produces: login em duas etapas — e-mail → `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` } })`
  → campo de código de 6 dígitos → `verifyOtp({ email, token, type: "email" })`. `/auth/confirm` troca `token_hash`
  por sessão (`verifyOtp({ type, token_hash })`) e redireciona para `next` ou `/`.
- Proxy: `/equipe/*` e `/api/equipe/*` exigem papel `equipe` (lido em `profiles`); usuário sem perfil ativo vai para
  `/login?motivo=sem-acesso`; `next` preservado no redirecionamento.

- [ ] **Step 1: Testes que falham** (`proxy.test.ts`, mockando `createServerClient`):
  - `anonymous on /disciplinas redirects to /login?next=/disciplinas`.
  - `student on /equipe gets redirected to /` e `student on /api/equipe gets 403 json`.
  - `inactive profile redirects to /login?motivo=sem-acesso`.
  - `login page shows the same neutral message for any email` (função `loginMessage()` exportada da página retorna a
    frase dos Global Constraints, independentemente do erro do Supabase).
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. A tela de login usa a identidade da Task 8 quando ela existir; até lá, só estrutura.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: login por link e código, papéis no proxy`.

### Task 8: Identidade visual, casca do app e PWA

**Files:**
- Create: `app/theme.css`, `components/BrandLogo.tsx`, `public/brand/pena-terracota.png`, `public/brand/pena-branca.png`,
  `public/icons/icon-192.png`, `public/icons/icon-512.png`, `app/manifest.ts`, `scripts/brand/make-assets.py`,
  `app/privacidade/page.tsx`
- Modify: `app/layout.tsx`, `app/globals.css`, `components/AppShell.tsx`, `app/login/page.tsx`

**Interfaces:**
- Produces: `<BrandLogo variant="light" | "dark" size?: "sm" | "md" />` (pena + "CURSOS" sobre "DUO" em Montserrat
  700); classes de tema `data-theme="light" | "dark"` no `<html>`, guardado em `localStorage` (`duo-tema`) com
  `try/catch`; navegação do aluno: "Disciplinas" (`/`), "Caderno" (`/caderno`); equipe vê também "Equipe" (`/equipe`).

- [ ] **Step 1:** `scripts/brand/make-assets.py` (Pillow): lê a pena JPG enviada
  (`/root/.claude/uploads/e67449dd-dc9b-5d11-984b-e28007219635/c2a9fa4e-image.jpg`), torna o branco transparente
  (limiar 235), salva `pena-terracota.png`, gera `pena-branca.png` (mesma máscara em `#F4F5F0`) e ícones 192/512 com a
  pena terracota sobre `#F4F5F0`. Rodar e commitar os PNGs (o script fica para regenerar quando chegar o vetor oficial).
- [ ] **Step 2:** `app/theme.css` com os tokens dos Global Constraints + derivados (`--bg`, `--text`, `--muted`,
  `--accent`, `--surface`, `--border`) para claro (papel `#F4F5F0`, texto `--duo-ink`, marca terracota, destaque verde) e
  escuro (fundo `--duo-ink`, texto `#F4F5F0`, destaque verde). Fontes via `@fontsource/montserrat/700.css` e
  `@fontsource/inter/{400,600}.css`. Reaproveitar o que servir de `globals.css` do atelie e apagar o resto.
- [ ] **Step 3:** `AppShell` refeito com a navegação acima (barra inferior fixa no celular < 768 px, lateral no PC),
  botão de tema e "Sair". `manifest.ts`: nome "Cursos DUO · Reta Final DPE-SP", `short_name` "DUO Reta Final",
  `display: "standalone"`, `theme_color #29343A`, `background_color #F4F5F0`, ícones acima.
- [ ] **Step 3b:** `/privacidade` (pública no proxy, link no rodapé do login): dados guardados (e-mail, nome, grifos,
  anotações, posição de leitura), finalidade (estudo no curso), controladora "Cursos DUO" e o pedido de exclusão pelo
  e-mail de contato do curso (texto `[e-mail de contato a confirmar com o DUO]` até a dona informar — único marcador
  permitido, listado nas pendências do spec §12).
- [ ] **Step 4: Verificar:** `npm run build` sem erros; Playwright em 390×844 e 1280×800 tirando print de `/login` nos
  dois temas (salvar em `docs/prints/`), conferir contraste do texto principal ≥ 4.5:1 com `@axe-core/playwright`
  (sem violações `color-contrast`).
- [ ] **Step 5:** Commit `feat: identidade DUO, casca responsiva e PWA`.

### Task 9: Leitor — disciplinas, seções, busca e "continuar"

**Files:**
- Create: `app/page.tsx` (substitui o do atelie), `app/disciplinas/[slug]/page.tsx`, `app/disciplinas/[slug]/[secao]/page.tsx`,
  `components/reader/SectionView.tsx`, `components/reader/TocDrawer.tsx`, `components/reader/SearchBox.tsx`,
  `lib/reader/queries.ts`, `app/api/busca/route.ts`, `app/api/leitura/posicao/route.ts`
- Test: `tests/duo/reader-queries.test.ts`

**Interfaces:**
- Consumes: `requireStudent` (Task 5), tabelas da Task 3.
- Produces:
  ```ts
  export type DisciplineCard = { slug: string; title: string; versionLabel: string; publishedAt: string; updatedSinceLastVisit: boolean; lastSectionId: string | null };
  export async function listDisciplines(supabase: SupabaseClient, userId: string): Promise<DisciplineCard[]>
  export type Toc = { id: string; level: number; numbering: string | null; title: string | null }[];
  export async function loadSection(supabase: SupabaseClient, slug: string, sectionId: string): Promise<{ toc: Toc; section: { id: string; title: string | null; path: string[]; paragraphs: { id: string; kind: string; text: string }[] }; prevId: string | null; nextId: string | null } | null>
  export async function searchDiscipline(supabase: SupabaseClient, slug: string, q: string): Promise<{ sectionId: string; sectionTitle: string | null; snippet: string }[]> // q ≥ 3 chars, máx. 30 resultados, ilike escapado
  ```
- Renderização: cada parágrafo é **um único elemento** `data-paragraph-id` com o `text` literal (tabela e nota em
  `white-space: pre-wrap`; `tip` como caixa de destaque) — pré-requisito dos offsets da Task 10.
- `/disciplinas/[slug]` redireciona para `lastSectionId` ou a primeira seção; abrir seção faz `PUT /api/leitura/posicao`.
- Ajuste de tamanho de letra (3 passos) guardado em `localStorage` (`duo-fonte`) com `try/catch`.

- [ ] **Step 1: Testes que falham** (FakeDb): `updated badge when published after last visit`;
  `prev/next skip container sections`; `search escapes % and _ and requires 3 chars`; `unknown slug returns null` (→ 404).
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar consultas, rotas e telas.
- [ ] **Step 4:** Rodar testes; `npm run build`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: leitor de disciplinas com sumário, busca e retomada`.

### Task 10: Grifos no leitor

**Files:**
- Create: `lib/highlights/dom.ts`, `components/reader/HighlightToolbar.tsx`, `components/reader/HighlightLayer.tsx`,
  `app/api/destaques/route.ts`, `app/api/destaques/[id]/route.ts`
- Test: `tests/duo/highlight-dom.test.ts` (ambiente `jsdom` só neste arquivo), `tests/duo/highlights-api.test.ts`

**Interfaces:**
- Consumes: `createAnchor`, `Anchor`, `HIGHLIGHT_COLORS` (Task 4); `loadSection` (Task 9).
- Produces:
  ```ts
  export function rangeToPoints(range: Range, root: HTMLElement): { start: Point; end: Point } | null // null se fora de [data-paragraph-id] ou em seções diferentes
  export function pointsToRanges(root: HTMLElement, start: Point, end: Point): Range[] // um Range por parágrafo, para pintar
  ```
- API: `GET /api/destaques?versao=<id>` (grifos ativos do aluno na versão), `POST /api/destaques`
  `{ versionId, start, end, color, note? }` → servidor recalcula a âncora com `createAnchor` sobre `loadVersionText`
  (não confia no `quote` do cliente) → `201 { highlight }`; `PATCH /api/destaques/[id]` `{ color?, note?, reviewed?: boolean }`;
  `DELETE /api/destaques/[id]`. Todas com `requireStudent`.
- UI: ao selecionar, aparece a barra (4 cores + "Anotar"); no celular fixa no rodapé. Pintura com `<mark>` por
  parágrafo via `pointsToRanges`. Toque num grifo abre: trocar cor, editar anotação, excluir. Salvamento otimista com
  reversão e aviso "Não foi possível salvar o grifo. Tente de novo."

- [ ] **Step 1: Testes que falham** (`highlight-dom.test.ts`):
  - `selection starting mid-word inside a table paragraph` → offsets exatos.
  - `selection inside a DICA DUO tip`.
  - `selection across two paragraphs` → start/end em parágrafos diferentes.
  - `selection outside paragraphs returns null`.
  - `pointsToRanges round-trips` (pintar e ler de volta dá o mesmo texto).
- [ ] **Step 2: Testes que falham** (`highlights-api.test.ts`): `server recomputes quote ignoring client text`;
  `rejects invalid color` (400); `note over 2000 chars` (400); `cannot patch another student's highlight` (404).
- [ ] **Step 3:** Rodar. Esperado: FAIL. Adicionar `jsdom` como devDependency fixa.
- [ ] **Step 4:** Implementar `dom.ts` (caminhar `TreeWalker` de texto dentro do elemento do parágrafo somando
  comprimentos), rotas e componentes.
- [ ] **Step 5:** Rodar. Esperado: PASS.
- [ ] **Step 6:** Commit `feat: grifos com cores e anotações no leitor`.

### Task 11: Caderno de revisão

**Files:**
- Create: `app/caderno/page.tsx`, `components/notebook/NotebookView.tsx`, `lib/notebook/queries.ts`
- Test: `tests/duo/notebook.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NotebookItem = { id: string; quote: string; note: string | null; color: HighlightColor; reviewed: boolean; orphaned: boolean; orphanedAt: string | null; disciplineSlug: string; disciplineTitle: string; sectionId: string | null; sectionPath: string[]; order: [number, number, number] };
  export type NotebookFilter = { disciplines?: string[]; colors?: HighlightColor[]; reviewed?: "all" | "pending" | "done" };
  export async function loadNotebook(supabase: SupabaseClient, userId: string, filter: NotebookFilter): Promise<{ discipline: { slug: string; title: string }; topics: { path: string[]; items: NotebookItem[] }[] }[]>
  ```
  `order` = (posição da disciplina, posição da seção, offset de início) — ordem do material. Órfãos ficam no fim de
  cada disciplina, no tópico "Trechos alterados na atualização".
- UI: filtros (disciplina, cor, revisados), cada item com faixa da cor, trecho, anotação editável, "Marcar como
  revisado", "Ir ao trecho" (`/disciplinas/[slug]/[secao]#p-<paragraphId>`), aviso nos órfãos: "Este trecho mudou na
  atualização de DD/MM." e botão "Exportar caderno".

- [ ] **Step 1: Testes que falham:** `grouped by discipline and section path in material order`;
  `orphaned go to the end with notice date`; `filters by color and reviewed state`; `other students' highlights never appear`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: caderno de revisão`.

### Task 12: Exportação do caderno em PDF

**Files:**
- Create: `lib/export/model.ts`, `lib/export/pdf.tsx`, `lib/export/fonts.ts`, `app/api/caderno/exportar/route.ts`
- Test: `tests/duo/export.test.ts`

**Interfaces:**
- Consumes: `loadNotebook`, `NotebookFilter` (Task 11).
- Produces:
  ```ts
  export type ExportItem = { quote: string; note: string | null; color: HighlightColor; reviewed: boolean; orphanedNotice: string | null; reference: string };
  export type ExportDoc = { title: string; subtitle: string; footer: string; generatedAt: string; disciplines: { title: string; topics: { heading: string; items: ExportItem[] }[] }[] };
  export function buildNotebookExport(notebook: Awaited<ReturnType<typeof loadNotebook>>, ownerEmail: string, now: Date): ExportDoc
  export async function renderPdf(doc: ExportDoc): Promise<Uint8Array>
  export const MAX_EXPORT_ITEMS = 3000;
  ```
  `title` "Caderno de revisão"; `subtitle` "Reta Final DPE-SP"; `footer` = texto dos Global Constraints;
  `reference` = `"<disciplina> › <caminho da seção>"`.
- `GET /api/caderno/exportar?disciplinas=a,b&cores=x,y&revisados=all` → `application/pdf`,
  `Content-Disposition: attachment; filename="caderno-duo-AAAA-MM-DD.pdf"`; acima de `MAX_EXPORT_ITEMS` → `413` com
  "Seu caderno ficou grande demais para um arquivo só. Filtre por disciplina e exporte em partes."
- PDF: capa com `pena-terracota.png` + "CURSOS DUO", título, subtítulo, data; sumário por disciplina; trechos com
  barra lateral na cor, anotação em itálico abaixo, referência em cinza; rodapé em toda página com número.
  Fontes registradas de `@fontsource` (arquivos `.woff`).

- [ ] **Step 1: Testes que falham:** `builds model in material order with references`;
  `footer carries the student email`; `orphaned item carries notice`;
  `renders a valid PDF with emoji and 2000-char note` (bytes começam com `%PDF-`; `extractPdf` do próprio projeto lê
  "Caderno de revisão" e o e-mail); `above MAX_EXPORT_ITEMS returns 413`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Emoji sem glifo na fonte não pode derrubar a geração (remover caracteres fora do
  plano básico multilíngue só no PDF, nunca no banco).
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: exportação do caderno em PDF com a identidade DUO`.

### Task 13: Painel da equipe

**Files:**
- Create: `app/equipe/page.tsx`, `app/equipe/conteudo/page.tsx`, `app/equipe/alunos/page.tsx`,
  `components/staff/ContentPanel.tsx`, `components/staff/StudentsPanel.tsx`
- Test: `tests/duo/staff-flow.test.ts`

**Interfaces:**
- Consumes: upload seguro (`lib/supabase/secure-documents.ts`), `POST /api/jobs` + `POST /api/jobs/[id]/advance`
  (atelie, agora com `DUO_HANDLERS`), rotas das Tasks 5 e 6.
- Produces: fluxo "Conteúdo": escolher disciplina (ou criar com título e slug) → enviar PDF/DOCX → barra de progresso
  das etapas → prévia (sumário e primeiras seções; contagem de seções, parágrafos e "DICA DUO") → rótulo da versão
  (padrão "Atualizado em DD/MM/AAAA") → "Publicar" (botão desabilitado durante a chamada) ou "Descartar"; resultado
  da publicação mostra grifos reancorados e órfãos. "Alunos": colar lista, ver relatório da Task 6, lista com busca e
  chave ativo/inativo.

- [ ] **Step 1: Teste que falha** (`staff-flow.test.ts`, FakeDb, ponta a ponta nas rotas): enviar
  `19-duo-ebook.pdf` → job até `succeeded` → rascunho → publicar → aluno lê a seção 1.1.
- [ ] **Step 2:** Rodar. Esperado: FAIL até as rotas estarem ligadas ao `DUO_HANDLERS`.
- [ ] **Step 3:** Implementar as telas.
- [ ] **Step 4:** Rodar; `npm run build`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat: painel da equipe para conteúdo e alunos`.

### Task 14: Ensaio com os ebooks reais e teste ponta a ponta

**Files:**
- Create: `scripts/ensaio-ebooks.ts`, `tests/e2e/aluno.spec.ts`, `playwright.config.ts`
- Modify: `README.md` (deploy: Supabase, Vercel, primeiro usuário da equipe, desligar cadastro aberto, URL de
  redirecionamento `/auth/confirm`, modelo de e-mail com `{{ .Token }}`)

**Interfaces:**
- `npx tsx scripts/ensaio-ebooks.ts <pasta>`: para cada PDF/DOCX da pasta, roda extrair → limpar (fiel) → segmentar →
  `buildDraft` e imprime: seções, parágrafos, "DICA DUO", resíduos de cabeçalho/rodapé encontrados por
  `findResidualNoise`, e títulos do sumário sem seção correspondente. Com `--atualizacao <base> <nova>`, roda
  `reanchor` com 50 grifos sintéticos sorteados (semente fixa) da base e imprime reancorados/órfãos.
- E2E (`tests/e2e/aluno.spec.ts`), contra um projeto Supabase de desenvolvimento definido por variáveis de ambiente;
  se as variáveis não existirem, o teste é **pulado com aviso**, nunca simulado: login por código (via
  `admin.generateLink`) → abrir disciplina → grifar no viewport 390×844 → ver no caderno → exportar PDF.

- [ ] **Step 1:** Baixar os 11 ebooks e a pasta `ATUALIZAÇÕES` do Drive para `/tmp/claude-0/…/scratchpad/ebooks`
  (fora do repositório) e rodar o ensaio. Critério: 0 resíduos de cabeçalho/rodapé; ≥ 90% dos títulos do sumário
  viram seções em cada ebook. Para cada ebook abaixo do critério, comparar PDF × DOCX e registrar no README qual
  formato a equipe deve enviar.
- [ ] **Step 2:** Ensaio de atualização Penal (base × 21.10.26): registrar no README quantos grifos reancoraram e
  quantos ficaram órfãos.
- [ ] **Step 3:** Escrever o E2E e rodar `npx playwright test` (Chromium em `/opt/pw-browsers`). Esperado: PASS com
  Supabase de desenvolvimento configurado, ou SKIP explícito sem ele.
- [ ] **Step 4:** `npm test && npx tsc --noEmit && npm run lint && npm run build && bash tests/db/verify.sh`. Esperado:
  tudo verde.
- [ ] **Step 5:** Commit `test: ensaio com ebooks reais e fluxo ponta a ponta do aluno`.
