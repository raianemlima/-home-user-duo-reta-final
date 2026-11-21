# Flashcards do aluno — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir que o aluno crie, a partir de um trecho selecionado nos ebooks, cartões de lacuna ou de pergunta e resposta, e que os revise com agenda espaçada no estilo do Anki.

**Architecture:**
- Uma tabela `flashcards` por aluno, protegida por RLS.
- Funções puras em `lib/flashcards/`, uma para a agenda e outra para as lacunas, usadas tanto no cliente quanto no servidor.
- Rotas em `app/api/flashcards`. O texto do cartão é recalculado no servidor com `sectionTextOf` + `createAnchor`, como nos grifos.
- UI: o botão "Flashcard" na barra de grifo, a página `/flashcards` e um aviso no Início.

**Tech Stack:** Next.js 16, React 19, Supabase (Postgres + RLS), Vitest, Playwright (mock do Supabase).

**Spec:** `docs/superpowers/specs/2026-11-21-flashcards-design.md`

## Global Constraints
- Trecho com 1–1500 caracteres; pergunta com 1–300; até 3000 cartões por aluno.
- Fatores da agenda:
  - facilidade inicial 2,5, limitada entre 1,3 e 3;
  - Difícil × 1,2 e −0,15; Bom × facilidade; Fácil × facilidade × 1,3 e +0,15; Errei −0,2;
  - cartão novo: Difícil e Bom → 1 d, Fácil → 4 d.
- Intervalo máximo: dias até a prova (pelo menos 1). Sem data de prova: 60.
- "Hoje" segue o fuso America/Sao_Paulo.
- Tabela ausente → GET devolve `{ disponivel: false }`; as escritas devolvem 503.
- Interface em português, com o verde DUO e os componentes existentes.

## Review Focus
1. Lacuna que cobre só pontuação ou espaços → recusada (400).
2. Seleção que atravessa dois parágrafos → o texto vem unido por "\n", e as lacunas continuam batendo com o texto do servidor.
3. Errei num cartão novo → o cartão continua em "hoje" e volta no fim da revisão, sem perder a facilidade.
4. Prova já passada, ou faltando 0 dias → intervalo 1, nunca 0 nem negativo.
5. Seção apagada numa republicação → o cartão continua na lista, sem o link "Ver no material".

---

### Task 1: Agenda e lacunas (funções puras)
**Files:**
- Create: `lib/flashcards/schedule.ts`, `lib/flashcards/cloze.ts`
- Test: `tests/duo/flashcards.test.ts`

**Interfaces:**
- `type Rating = "errei" | "dificil" | "bom" | "facil"`
- `type Sched = { intervalDays: number; ease: number; reps: number; lapses: number }`
- `schedule(card: Sched, rating: Rating, today: string, examDate: string | null): Sched & { dueOn: string }`
- `todayBR(now: Date): string`
- `previewLabels(card, today, examDate): Record<Rating, string>`, que devolve, por exemplo, "<10 min" e "3 d".
- `wordsOf(text): { start: number; end: number }[]` — a pontuação nas pontas fica de fora.
- `gapsFrom(text, wordIdx: number[]): [number, number][]` — junta palavras vizinhas.
- `validGaps(text, gaps): boolean`
- `maskPieces(text, gaps): { text: string; gap: boolean }[]`

- [ ] Testes:
  - cada nota em cartão novo e em cartão maduro (interval 10, ease 2,5 → Difícil 12, Bom 25, Fácil 33);
  - limite da prova (prova a 5 dias → Bom ≤ 5) e prova passada → 1;
  - facilidade ≥ 1,3;
  - Errei → dueOn = hoje, reps 0, lapses + 1 só se reps > 0;
  - wordsOf("prazo em dobro.") → 3 palavras, e "dobro" sem o ponto;
  - gapsFrom junta palavras vizinhas;
  - validGaps recusa vazio, sobreposição e intervalos fora do texto ou só com espaço.
- [ ] Implementar e rodar `npx vitest run tests/duo/flashcards.test.ts` → PASS. Commit.

### Task 2: Migração 0022_flashcards (+ .down) e testes de RLS
**Files:**
- Create: `supabase/migrations/0022_flashcards.sql` e `.down.sql`
- Modify: `tests/db/verify.sh` (LATER), `tests/db/assertions-later.sql`

Colunas:
- `id`, `user_id` (default auth.uid())
- `discipline_id` (null, set null), `section_id` uuid null, `origem` text ≤ 300
- `tipo` ('lacuna' | 'pergunta'), `texto` 1–1500, `pergunta` ≤ 300; obrigatória quando tipo = 'pergunta'
- `lacunas` jsonb array, default '[]'
- `due_on` date default (now() at time zone 'America/Sao_Paulo')::date
- `interval_days` int ≥ 0 default 0, `ease` numeric(4,2) entre 1,3 e 3, default 2,5
- `reps`, `lapses` int default 0
- `reviewed_at`, `created_at`, `updated_at` (trigger touch_updated_at)

Também:
- índice (user_id, due_on);
- política `flashcards_own` igual à de 0021.

- [ ] Asserções:
  - A cria um cartão;
  - B não vê, não altera e não insere em nome de A;
  - o inativo não insere;
  - pergunta vazia em tipo 'pergunta' é recusada.
- [ ] Rodar `tests/db/verify.sh` num Postgres descartável → todas as linhas OK. Commit.

### Task 3: API
**Files:**
- Create: `app/api/flashcards/route.ts` (GET e POST), `app/api/flashcards/[id]/route.ts` (PATCH e DELETE), `app/api/flashcards/[id]/revisar/route.ts` (POST {nota})
- Create: `lib/flashcards/server.ts` (colunas, `toCardView`, `missingTable`)
- Test: `tests/duo/flashcards-api.test.ts`

Contrato:
- `CardView = { id, tipo, texto, pergunta, lacunas, origem, disciplineSlug, disciplineTitle, sectionId (null se a seção não está na versão publicada), dueOn, intervalDays, ease, reps, lapses }`
- `GET` → `{ disponivel, hoje, cards }`
- `POST` → body `{ versionId, start, end, tipo, pergunta?, lacunas? }`, responde 201 `{ card }`
- `PATCH` → `{ pergunta? , lacunas? }`
- `revisar` → `{ card }`, com a agenda calculada no servidor a partir de `EXAM_DATE`

- [ ] Testes (mesmo estilo de `tests/duo/informativos.test.ts`):
  - cria lacuna e pergunta;
  - recusa lacuna inválida, pergunta longa, trecho > 1500 e o cartão 3001;
  - revisar Bom altera due_on;
  - PATCH e DELETE só nos cartões do próprio aluno;
  - tabela ausente → disponivel false e 503.
- [ ] Implementar, rodar e fazer o commit.

### Task 4: Interface
**Files:**
- Create: `components/flashcards/FlashcardSheet.tsx` (criar e editar: abas Lacuna e Pergunta, palavras como botões com aria-pressed)
- Create: `components/flashcards/FlashcardsView.tsx` (contagem, filtro de disciplina, Revisar, lista com busca, editar e excluir)
- Create: `components/flashcards/Review.tsx` (frente → "Mostrar resposta" → 4 botões com previewLabels; Errei põe o cartão no fim da fila)
- Create: `components/flashcards/HomeFlashcards.tsx`, `app/flashcards/page.tsx`
- Modify:
  - `components/reader/HighlightToolbar.tsx` (botão "Flashcard");
  - `components/reader/HighlightLayer.tsx` (o trecho no cliente = mesma junção "\n" de `flatten`);
  - `components/AppShell.tsx` (item "Flashcards");
  - `app/page.tsx` (HomeFlashcards depois da frase);
  - `app/globals.css`
- Modify: `tests/e2e/support/mock-supabase.mjs` (tabela `flashcards` com 1 cartão vencido)
- Test: `tests/e2e/flashcards.spec.ts`
  - selecionar → Flashcard → tocar numa palavra → Salvar → aviso "Cartão criado ✓";
  - /flashcards → Revisar → Mostrar resposta → Bom → "Revisão do dia concluída".
- [ ] tsc, eslint, vitest e e2e verdes. Prints no celular e no computador, nos temas claro e escuro. Commit.

### Task 5: Publicar nos dois apps
- [ ] DPE-SP: push, PR → merge → aplicar 0022 no Supabase da DPE-SP → conferir o deploy.
- [ ] DPE-RN: portar os mesmos arquivos (migração 0023, `examDate` vindo de `COURSE.examDate`), testes, push na main, aplicar a migração no Supabase da DPE-RN e conferir o deploy.
