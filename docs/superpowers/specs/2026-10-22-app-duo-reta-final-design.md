# App de estudo DUO — Reta Final DPE-SP (design)

Data: 22/10/2026 · Status: **rascunho para revisão**

## 1. Objetivo

Oferecer à dona do Cursos DUO um app só de conteúdo para os alunos do curso **Reta Final DPE-SP**, usável no PC e no
celular, construído a partir dos ebooks do curso. O aluno lê o material, grifa, anota e monta um **caderno de revisão**
que pode exportar com a identidade do DUO. Não há IA: todo texto exibido é o texto original da professora.

Sucesso do piloto: um grupo de alunos da lista entra com o próprio e-mail, lê as 11 disciplinas no PC e no celular,
grifa, revisa no caderno e exporta um PDF com a marca DUO, sem intervenção técnica da equipe no dia a dia.

## 2. Entendimento acordado

**Dito por você**
- Base de código: o `atelie-do-conhecimento` (Next.js + Supabase), não o esqueleto Django da plataforma DUO.
- Conteúdo: os ebooks da pasta "ebooks de reta final" (11 disciplinas, PDF e DOCX) e a pasta `ATUALIZAÇÕES`.
  O curso é pré-edital e está sendo atualizado para o pós-edital.
- Sem IA. O aluno lê no app, grifa, salva no caderno de revisão e exporta.
- Exportação em PDF e DOCX.
- Apostila determinística por tema (a partir do mapa temático, sem reescrever texto) é o próximo passo natural.
- Login dos alunos por lista de e-mails enviada pela dona, adicionada aos poucos.
- Logo oficial: pena no círculo + "CURSOS DUO" (print do site).

**Suposições minhas (corrija se estiverem erradas)**
- App web instalável (PWA), sem publicação em loja.
- Um projeto Supabase e um repositório **separados** do atelie, para não misturar dados de alunos com os seus.
- O aluno **não** baixa o PDF original na V1 (a dona decide; ver §12).
- Hospedagem na Vercel.

## 3. Escopo

**V1 — piloto**
1. Acesso por convite: equipe cadastra e-mails; aluno entra por link mágico/código no e-mail. Sem cadastro aberto.
2. Painel da equipe: subir ebook (PDF ou DOCX), conferir a prévia em seções e publicar; gerenciar alunos (adicionar
   lista, desativar).
3. Leitor: disciplinas → sumário → seções, com busca no texto, "continuar de onde parei" e modo claro/escuro.
4. Grifos: selecionar trecho, escolher uma de 4 cores, anotação opcional.
5. Caderno de revisão: grifos agrupados por disciplina e tópico, filtros por cor e por "revisado", marcar como
   revisado, editar anotação, ir ao trecho no leitor.
6. Exportação do caderno em **PDF** com a identidade DUO.
7. Atualização de ebook (nova versão) sem perda dos grifos dos alunos (§7).

**V2**
- Exportação em **DOCX** (mesmo modelo de documento da V1, novo renderizador).
- **Apostila por tema**: mapa temático do atelie juntando trechos de todas as fontes, sem parágrafos repetidos, com
  citações literais; publicada como forma extra de leitura e exportável em PDF/DOCX.
- Leitura offline das disciplinas já abertas.

**Fora do escopo**: vídeo, vendas/Hotmart, simulados, comunidade, certificados, qualquer recurso com IA.

## 4. Arquitetura

- **Stack**: Next.js (App Router) + TypeScript + Supabase (Postgres, Auth, Storage, RLS) + Vitest, como no atelie.
- **Repositório novo** criado a partir do atelie. Mantém-se:
  - `lib/extraction` (PDF com layout e DOCX), `lib/cleaning`, `lib/segmentation`, `lib/pipeline` (etapas curtas e
    persistidas, ADR 004), `lib/server/*` (auth, http, upload validado no servidor, ADR 003), `lib/supabase/*`,
    `proxy.ts` e a infraestrutura de testes.
  - `lib/thematic` e `lib/citations` ficam no repositório, sem tela, para a apostila da V2.
- Remove-se: `lib/drafting`, `lib/verification`, `lib/ai`, `lib/study-guide` e as telas de projetos, fontes, materiais
  e dados do atelie.
- **Novo código**:
  - `lib/reader/` — monta seções e parágrafos publicados para leitura.
  - `lib/highlights/` — ancoragem e reancoragem de grifos (funções puras, sem I/O).
  - `lib/export/` — modelo de documento independente de formato (`ExportDoc`) + renderizador PDF.
  - `app/(aluno)/…` — disciplinas, leitor e caderno.
  - `app/equipe/…` — conteúdo e alunos.

### Limpeza no modo "fiel"
O limpador do atelie remove menções a professor, aulas, links e propaganda. Aqui o material **é** do curso, então a
ingestão usa um perfil fiel: remove só ruído de diagramação (cabeçalho "EBOOK DE RETA FINAL", rodapé "Cursos DUO ·
Extensivo Inteligente · Atualizado em … Página N", números de página, hifenização quebrada e linhas do sumário).
Nenhuma frase do conteúdo é removida. Caixas "DICA DUO" viram um bloco de destaque no leitor.

## 5. Modelo de dados (Supabase)

| Tabela | Campos principais | Quem lê / escreve |
|---|---|---|
| `profiles` | `user_id`, `email`, `name`, `role` (`equipe`/`aluno`), `active` | aluno lê o próprio; equipe tudo |
| `disciplines` | `id`, `slug`, `title`, `position` | aluno ativo lê; equipe escreve |
| `content_versions` | `id`, `discipline_id`, `label` (ex.: "Pré-edital · 29/07/2026"), `source_sha256`, `status` (`draft`/`published`/`archived`), `published_at` | aluno ativo lê só `published`; equipe escreve |
| `sections` | `id`, `version_id`, `position`, `level`, `numbering`, `title`, `path` | idem versão |
| `paragraphs` | `id`, `section_id`, `version_id`, `position`, `kind` (`body`/`table`/`footnote`/`tip`), `text`, `hash` | idem versão |
| `highlights` | `id`, `user_id`, `discipline_id`, `version_id`, `start_paragraph_id`, `start_offset`, `end_paragraph_id`, `end_offset`, `quote`, `prefix`, `suffix`, `color`, `note`, `status` (`active`/`orphaned`), `reviewed_at`, timestamps | **só o dono** |
| `reading_positions` | `user_id`, `discipline_id`, `section_id`, `updated_at` | só o dono |

- Uma única versão `published` por disciplina (índice único parcial).
- RLS em todas as tabelas. A função `is_active_student()` confere `profiles.active`: desativar um aluno corta o acesso
  ao conteúdo na hora, mas os grifos dele ficam guardados.
- A chave de serviço só é usada no servidor (convites e reancoragem), como já exige `lib/server/env.ts`.

## 6. Fluxos

**Acesso**
- Cadastro aberto desligado no Supabase.
- A equipe cola a lista de e-mails em `/equipe/alunos`. O servidor valida, remove duplicados, cria `profiles` e envia
  o convite (`auth.admin.inviteUserByEmail`).
- O aluno entra por link mágico ou código de 6 dígitos (mais fácil no celular).
- E-mail fora da lista recebe a mesma mensagem neutra, para não revelar quem é aluno.

**Ingestão e publicação (equipe)**
- Upload → validação no servidor → etapas extrair → limpar (fiel) → segmentar → versão `draft`.
- Prévia com sumário e seções. **Publicar** arquiva a versão anterior e dispara a reancoragem (§7).
- **Descartar** apaga o rascunho.

**Leitura (aluno)**
- Lista de disciplinas com a data de atualização e um selo "atualizado" quando a versão mudou desde a última visita.
- Sumário lateral (gaveta no celular), uma seção por tela, botões anterior/próxima.
- Busca no texto da disciplina.

**Grifo**
- Selecionar um trecho dentro de uma seção mostra uma barra com as 4 cores e "anotar".
  - No celular a barra fica fixa no rodapé, longe do menu nativo de copiar.
- Cores com significado fixo e legenda: amarelo "Importante", verde "Lei seca", azul "Jurisprudência",
  rosa "Revisar".
- Salvamento otimista: se falhar, o grifo some e aparece um aviso para tentar de novo.

**Caderno**
- Organizado por disciplina → caminho da seção, na ordem do material.
  - Mudança em relação ao que eu disse antes: sem reordenação manual na V1.
- Mostra o trecho, a anotação, a cor e o estado.
- Grifos `orphaned` aparecem com o aviso "este trecho mudou na atualização de DD/MM", mantendo o texto e a anotação.

**Exportação**
- O aluno escolhe disciplinas e cores e baixa o PDF.
- O PDF tem capa com a logo e o título "Caderno de revisão". O sumário segue as disciplinas e os tópicos. Cada trecho
  vem com a faixa da cor, a anotação abaixo e a referência ("Dir. Penal › 3. Crimes contra a vida › 3.2").
- Rodapé: "Cursos DUO · Reta Final DPE-SP · uso pessoal de <e-mail do aluno>" (ver §12).

## 7. Ancoragem de grifos e atualizações

O grifo guarda a posição (parágrafo e deslocamento) **e** o texto: trecho exato, 32 caracteres antes e 32 depois.
Ao publicar uma versão nova, para cada grifo da disciplina:

1. Se o parágrafo de início e o de fim existem na nova versão com o mesmo `hash`, os deslocamentos são mantidos.
2. Senão, o trecho exato é procurado primeiro na seção de mesmo caminho e depois na disciplina inteira.
   - Uma ocorrência: reancora.
   - Várias: desempata pelo contexto antes e depois. Se continuar empatado, o grifo fica `orphaned`.
3. Sem ocorrência: `orphaned`. Nada é apagado.

O algoritmo é uma função pura e determinística (`lib/highlights/reanchor.ts`). Roda no servidor, em lote, no momento
da publicação. Normalização para comparar: espaços colapsados e aspas/traços unificados. O trecho salvo nunca é
alterado.

## 8. Identidade visual

- **Logo oficial**: pena no círculo + "CURSOS DUO".
  - Versão clara (terracota, para fundo branco): no cabeçalho claro, no PDF e no ícone do app.
  - Versão branca: no tema escuro e na tela de login.
- **Cores provisórias** (lidas de foto de tela e do arquivo da pena; serão conferidas com os arquivos oficiais):

  | Token | Cor | Uso |
  |---|---|---|
  | `--duo-ink` | `#29343A` | fundo escuro, texto principal no claro |
  | `--duo-green` | `#31BF5D` | destaque, botões principais, progresso |
  | `--duo-teal` | `#375963` | faixas, links |
  | `--duo-terracotta` | `#AE4941` | marca em fundo claro |
  | `--duo-paper` | `#F4F5F0` | fundo de leitura no modo claro |

- **Fontes**: Montserrat nos títulos e na marca (a confirmar). Texto corrido numa fonte de leitura confortável
  (Inter, que o site declara).
- Todas as cores ficam em tokens num único arquivo (`app/theme.css`); a logo fica em `public/brand/`. Trocar a
  identidade é editar esses dois lugares.
- Contraste AA no texto. Alvos de toque de 44 px. Tamanho de letra ajustável no leitor.

## 9. Celular e PC

- PWA: manifesto, ícones gerados da logo e instalação pela tela inicial (Android e iOS).
- V1 exige internet; a V2 adiciona leitura offline.
- Layout responsivo único:
  - No celular: uma coluna, sumário em gaveta e barra de grifo no rodapé.
  - No PC: sumário fixo à esquerda e caderno acessível ao lado.

## 10. Erros e casos-limite

- **PDF escaneado ou protegido**: a ingestão recusa com mensagem clara (o atelie já trata, ADR 005).
- **Segmentação ruim de um ebook**: a prévia mostra o problema antes de publicar. A equipe corrige a fonte (prefere o
  DOCX) e sobe de novo.
- **Grifo cruzando seções**: a seleção é limitada à seção atual.
- **Sessão expirada**: volta ao login e retorna à mesma página.
- **Aluno desativado**: perde acesso ao conteúdo e ao caderno; os dados ficam guardados até pedido de exclusão.
- **Exportação grande**: é gerada no servidor com limite de tamanho. Acima dele, sugere filtrar por disciplina.

## 11. Testes

- **Unidade (Vitest)**: reancoragem (mesmo hash, trecho movido, trecho repetido, trecho removido, normalização),
  limpeza fiel com amostras reais (rodapé e cabeçalho do DUO saem, frases do conteúdo ficam), segmentação dos 11 ebooks
  (sumário bate com as seções) e o modelo `ExportDoc`.
- **Banco**: asserções de RLS no padrão `tests/db` do atelie. Aluno A não vê grifos de B; aluno inativo não lê
  conteúdo; aluno não lê rascunho.
- **Ponta a ponta (Playwright, Chromium do ambiente)**: login → abrir disciplina → grifar no viewport de celular →
  ver no caderno → exportar PDF.
- **Ensaio de atualização**: publicar o Penal original, grifar e publicar a atualização de 21/10/26. Conferir quantos
  grifos reancoraram e quantos ficaram órfãos.

## 12. Pendências e decisões da dona do curso

1. **Logo em arquivo** (SVG ou PNG transparente, versões clara e branca) e confirmação de cores e fontes.
2. **Lista de alunos** do piloto.
3. **Direitos e proteção**: o aluno pode baixar o PDF original? O rodapé "uso pessoal de <e-mail>" no export é
   aceitável? (Padrão proposto: sem download do original; com rodapé.)
4. **LGPD**: aviso de privacidade simples (dados guardados: e-mail, nome, grifos, anotações) e canal para pedido de
   exclusão. A dona é a controladora.
5. **Cabeçalho "DPE/RJ"** encontrado no ebook de Princípios da DPE-SP: confirmar se é erro de modelo.
6. **Onde hospedar**: repositório GitHub e projetos Supabase/Vercel em nome de quem (seu ou do DUO).
