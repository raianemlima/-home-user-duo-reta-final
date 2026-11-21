# Leitura fiel ao PDF — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mostrar no leitor o negrito, o itálico, o sublinhado, as cores, os recuos, os marcadores e as caixas do PDF de cada ebook, sem mudar o texto publicado.

**Architecture:**
- `lib/formatting/pdf-styles.ts` lê do PDF linhas com trechos estilizados e os retângulos preenchidos.
- `lib/formatting/align.ts` encaixa esses trechos nos parágrafos publicados e produz `ParagraphFormat`, que é gravado em `paragraphs.format`.
- `lib/formatting/apply.ts` faz isso para uma versão inteira (lê o PDF do storage e grava em lotes). É chamado depois de criar o rascunho e pelo botão da Equipe.
- O leitor parte o texto também nos limites das marcas.

**Tech Stack:** pdfjs-dist 6 (legacy), Next.js 16, Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-formatacao-fiel-design.md`

## Global Constraints
- O texto, o hash e as posições dos parágrafos nunca mudam. As marcas ficam dentro de `[0, texto.length]`.
- Se a formatação falhar, a publicação não falha (`console.warn` e segue).
- Cor guardada só quando difere da cor dominante do corpo do texto.
- Contraste mínimo de 4,5:1 nos dois temas, com as cores ajustadas na hora de mostrar.
- No celular (até 600 px), recuo de no máximo 2 níveis.
- Tabelas (`kind = "table"`) ficam sem marcas nesta etapa.

## Review Focus
1. Parágrafo que a limpeza alterou (marca d'água removida, hífen de quebra) → encaixa o resto, e as marcas nunca caem em letras erradas.
2. Grifo do aluno que começa no meio de um trecho em negrito → o `<mark>` e o `<strong>` se aninham sem duplicar texto, e a seleção nova dá as mesmas posições.
3. Cor muito clara ou muito escura do PDF no tema escuro → continua legível.
4. Ebook com 1000+ parágrafos → grava em lotes, sem estourar o tempo da função.
5. Banco sem a coluna `format` → o leitor funciona como hoje, e o botão avisa "aplique a migração".

---

### Task 1: Leitura de estilos do PDF
- Files: create `lib/formatting/types.ts` and `lib/formatting/pdf-styles.ts`; test `tests/duo/formatting-pdf.test.ts`.
- `type Run = { text: string; bold: boolean; italic: boolean; underline: boolean; color: string | null; symbol: boolean }`
- `type StyledLine = { page: number; y: number; x0: number; runs: Run[]; box: string | null; marginX: number }`
- `extractStyledLines(bytes: Uint8Array): Promise<{ lines: StyledLine[]; bodyColor: string | null }>`
  - Fontes: `fontExtraProperties: true`. Negrito se o nome tiver /bold|black|heavy|semibold|demi/i; itálico se tiver /italic|oblique/i.
  - Cor: percorre `fnArray`; `setFillRGBColor` e `setFillGray` definem a cor atual. Os glifos de cada `showText` recebem essa cor, e as letras dos itens do `getTextContent` são pareadas em ordem com os glifos (sem espaços).
  - Retângulos preenchidos não brancos com sua cor; os finos (≤ 1,5 pt de altura), logo abaixo da linha de base, viram sublinhado.
  - Linhas na zona de cabeçalho ou rodapé (mesmos limites de `layout.ts`) ficam de fora.
- Teste: um PDF gerado com `@cantoo/pdf-lib` (Helvetica-Bold, Helvetica-Oblique, cor verde, retângulo de fundo e linha de sublinhado) → cada trecho com o estilo esperado.

### Task 2: Encaixe nos parágrafos
- Files: create `lib/formatting/align.ts`; test `tests/duo/formatting-align.test.ts`.
- `type ParagraphFormat = { m?: [number, number, string, string?][]; indent?: number; bullet?: "check" | "dot"; box?: string }` — no estilo, "b", "i" e "u" combinados.
- `formatParagraphs(paragraphs: { id: string; text: string; kind: string }[], styled: { lines: StyledLine[]; bodyColor: string | null }): Map<string, ParagraphFormat>`
  - Fluxo de letras do PDF sem espaços, cada uma com estilo, linha e posição.
  - Cada parágrafo, em ordem, procura a sua sequência de letras sem espaços a partir do cursor (busca exata). Se não achar, tenta só com os primeiros 40 caracteres e segue letra a letra, pulando hífens e diferenças. Abaixo de 90% de correspondência, o parágrafo fica sem formato.
  - Recuo: x0 da linha − margem → nível = arredondar(Δ / 36), entre 0 e 4. Usa a mediana das linhas do parágrafo, sem contar a primeira quando ela tem recuo próprio. Os itens com marcador usam o x0 do texto.
  - Caixa: cor da maioria das linhas do parágrafo.
- Testes:
  - hífen de quebra de linha;
  - parágrafo ausente fica sem formato;
  - marcas mescladas e dentro dos limites;
  - recuo de citação: nível 2 ou mais;
  - caixa e marcador;
  - ensaio com `mat/const.pdf`, se o arquivo existir: "vínculo jurídico-político entre uma pessoa e o Estado" em negrito.

### Task 3: Migração e aplicação
- Files:
  - `supabase/migrations/0023_paragraph_format.sql` (+ .down); na DPE-RN, 0024;
  - `lib/formatting/apply.ts`;
  - `app/api/equipe/formatacao/route.ts` (POST {versionId} → `{ formatted, total }`);
  - modify `app/api/equipe/versoes/route.ts` (chama a aplicação depois do saveDraft, com try/catch);
  - `components/staff/ContentPanel.tsx` (botão "Aplicar formatação do PDF" que percorre as versões publicadas);
  - `tests/db`.
- `applyFormatting(admin: SupabaseClient, versionId: string): Promise<{ formatted: number; total: number }>`: lê `content_versions.source_path` e baixa do bucket `documents`. Arquivo que não é PDF → `{0, total}`. Grava `format` com `update` por id, 50 em paralelo.
- `export const maxDuration = 300` na rota.

### Task 4: Leitor
- Files: `lib/reader/queries.ts` (lê `format` com fallback se a coluna faltar); `components/reader/HighlightLayer.tsx`; `lib/formatting/render.ts` (`splitByMarks`, `readableColor`); `app/globals.css`; `tests/duo/formatting-render.test.ts`; `tests/e2e` (mock com `format` num parágrafo).
- `readableColor(hex: string, theme: "light" | "dark"): string`: ajusta a luminosidade (HSL) até ter contraste de 4,5:1 contra o fundo do tema (#FFFFFF ou #F7F6F1 no claro, #1B2A22 ou #14201A no escuro).
- O CSS recebe `--c-light` e `--c-dark` no `style` e escolhe a cor pelo tema.
- Testes: uma marca que corta um grifo; seleção dentro do `<strong>` → offset certo (e2e); axe sem violações de contraste.

### Task 5: Publicar
- SP: PR → merge → migração → Vercel; depois a Raiane clica no botão.
- RN: portar, migração 0024, deploy.
