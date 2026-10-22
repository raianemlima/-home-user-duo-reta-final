# Cursos DUO · Reta Final DPE-SP

App de estudo só de conteúdo para os alunos do curso **Reta Final DPE-SP**: o aluno lê os ebooks no PC ou no celular,
grifa, anota, revisa num caderno e exporta o caderno em PDF com a identidade do DUO. Não há IA: todo texto exibido é o
texto original do material.

Derivado do [Ateliê do Conhecimento](https://github.com/raianemlima/atelie-do-conhecimento) (extração, limpeza,
segmentação e motor de etapas). Design: `docs/superpowers/specs/`. Plano: `docs/superpowers/plans/`.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com o projeto Supabase
npm run dev
```

- Testes: `npm test` · tipos: `npx tsc --noEmit` · lint: `npm run lint`
- Banco (Postgres descartável): `bash tests/db/verify.sh`

## Variáveis

| Variável | Onde | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | público | chave publicável |
| `SUPABASE_SERVICE_ROLE_KEY` | só servidor | criação de alunos e reancoragem de grifos |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | público | chave pública dos avisos no celular (Web Push) |
| `VAPID_PRIVATE_KEY` | só servidor | chave privada dos avisos; gere o par com `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | só servidor | contato dos avisos, ex.: `mailto:equipe@cursosduo.com.br` |
| `ALUNO_SENHA_PADRAO` | só servidor | senha inicial dos alunos criados em Equipe › Alunos (não versionar) |
| `NEXT_PUBLIC_SITE_URL` | público | endereço público do app; só mude se o domínio mudar (padrão: `https://duo-reta-final.vercel.app`) |

Os ebooks do curso **não** são versionados neste repositório (direitos autorais).

## Publicar (Supabase + Vercel)

1. **Supabase**: crie um projeto só para o DUO. Aplique as migrações em ordem (`supabase/migrations/0001…0009`, sem os arquivos `.down`
   e **sem a 0005**, que o próprio atelie marca como não aplicada: ela exige que o envio de documentos use a chave de serviço).
   Projeto atual: `duo-reta-final` (`https://xslqdunmykikmslgntqz.supabase.co`, região São Paulo), já com 0001–0004 e 0006–0009.
2. **Auth** (Authentication → Providers/Settings):
   - desligue o cadastro aberto ("Allow new users to sign up");
   - em URL Configuration, adicione `https://SEU_DOMINIO/auth/confirm` às Redirect URLs;
   - alunos criados em Equipe › Alunos entram com a senha padrão (`ALUNO_SENHA_PADRAO`) e são levados a **trocar a senha no primeiro acesso**;
     cada aluno só mantém **uma sessão ativa** (ao entrar em outro aparelho, o anterior é encerrado; a equipe pode usar vários);
   - o login é por **e-mail e senha**: não depende de e-mail enviado pelo Supabase. Só entra quem foi criado em
     Equipe › Alunos (ou em Authentication → Users); com o cadastro aberto desligado, ninguém mais se cria.
3. **Primeiro usuário da equipe**: convide pelo painel do Supabase e rode no SQL Editor:
   `insert into public.profiles(user_id, email, role) select id, email, 'equipe' from auth.users where email = 'equipe@cursosduo.com.br';`
4. **Vercel**: importe o repositório e defina `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `NEXT_PUBLIC_PIPELINE_V2=true` e `SUPABASE_SERVICE_ROLE_KEY` (esta só no servidor).

   O endereço que os alunos usam é **https://duo-reta-final.vercel.app** (domínio de produção do projeto
   `prj_im9KyZyQ2mt1znt60577ZHWAhCVG`). Cada merge em `main` publica ali por dois caminhos, e basta um funcionar:

   - a **integração Git da Vercel** (Project › Settings › Git), que publica sozinha o que entra em `main`; e
   - o workflow **Deploy produção** (`.github/workflows/deploy.yml`), que roda a cada push em `main` e também
     manualmente, e depende do segredo `VERCEL_TOKEN` em Settings › Secrets and variables › Actions.

   Se a atualização não aparecer no domínio, confira nessa ordem: o domínio está em Project › Settings › Domains
   como **Production**; a integração Git está conectada a este repositório com `main` como Production Branch; e o
   segredo `VERCEL_TOKEN` existe (sem ele o workflow termina avisando, sem publicar).
5. Entre como equipe → **Equipe › Conteúdo**: crie as disciplinas, envie os ebooks (PDF), confira a prévia e publique.
   **Equipe › Alunos**: cole a lista de e-mails.

## Ensaio com os ebooks reais

`ENSAIO_DIR=/pasta/com/os/ebooks [ENSAIO_BASE=antigo.pdf ENSAIO_NOVA=novo.pdf] npm run ensaio` gera
`ensaio-relatorio.md` (os arquivos não entram no repositório).

Resultado em 22/10/2026, com os 11 ebooks do Reta Final DPE-SP (PDF):

| Ebook | Seções | Parágrafos | Resíduos de cabeçalho/rodapé | Títulos do sumário com seção |
|---|---|---|---|---|
| Administrativo e Tributário | 63 | 1002 | 0 | 31/31 (100%) |
| Civil | 159 | 1432 | 0 | 67/71 (94%) |
| Constitucional | 99 | 828 | 0 | 56/57 (98%) |
| Processual Civil | 76 | 907 | 0 | 44/44 (100%) |
| Criança e Adolescente | 111 | 960 | 0 | 36/36 (100%) |
| Difusos e Coletivos | 103 | 965 | 0 | 54/59 (92%) |
| Direitos Humanos | 97 | 810 | 0 | 76/84 (90%) |
| Penal | 122 | 1109 | 0 | 58/64 (91%) |
| Processual Penal | 111 | 1035 | 0 | 51/55 (93%) |
| Princípios e Atribuições | 22 | 222 | 0 | 14/14 (100%) |
| Teses Institucionais | 162 | 344 | 0 | (sem sumário) |

- Todos os ebooks atingiram o critério (≥ 90%), então a equipe pode enviar **o PDF**; o DOCX não foi necessário.
  Os títulos restantes sem seção são, em geral, subtítulos muito longos que quebram em várias linhas.
- **Atualização do Penal (21/10/2026)**: dos 50 grifos sorteados na versão anterior, **50 foram reposicionados** e 0 ficaram
  como "trecho alterado".

## Banco de questões

As questões vêm do repositório REVIEW-RAI (`ferramentas/conteudo/dados/simulados/*.json`) e ficam em `data/questoes.json`. Entram só as da DPE-SP e as de Defensor da FCC de 2021 em diante (regra `keep` no importador).
Para atualizar depois de mudar as questões lá: `node scripts/questoes/importar.mjs /caminho/para/review-rai`, confira e faça o commit.
As respostas de cada aluno ficam na tabela `question_answers` (migração 0015).

### Fundamentação do gabarito

`data/fundamentacoes.json` guarda, por questão, a fundamentação conferida nas fontes: uma nota ligando o
dispositivo à alternativa correta, os dispositivos e a data da conferência. Cada dispositivo diz o que é:

- `tipo: "lei"` — **transcrição literal** do dispositivo, com `url` da página oficial de onde o texto veio
  (Portal da Legislação do Planalto, em regra o *texto compilado*);
- `tipo: "entendimento"` — **resumo** da posição do tribunal ou do órgão (STF, STJ, Corte IDH, CIDH, OIT…),
  ou da construção doutrinária. A tela rotula como resumo, para o aluno não confundir com lei seca.

Quando a conferência não fecha, o campo `ressalva` aparece em destaque na tela do aluno: gabarito oficial
discutível, duas alternativas corretas, questão superada por lei nova, norma estadual ou interna de outra
Defensoria que não foi possível conferir, ou tese que só se sustenta em doutrina.

A fundamentação vai ao aparelho sob demanda (`GET /api/questoes/[id]/fundamentacao`), quando o aluno já viu
a correção: o texto de lei inteiro na primeira carga pesaria no celular.

Confira o arquivo com `node scripts/questoes/conferir-fundamentacao.mjs` (`--cobertura` mostra o andamento
por disciplina). Os mesmos invariantes estão em `tests/duo/questions.test.ts`.

As transcrições do tipo `lei` são conferidas palavra por palavra contra a página oficial com
`node scripts/questoes/conferir-transcricao.mjs` (baixa cada `url` uma vez e guarda em `.cache/leis`).

## Cronograma de estudos

O aluno escolhe, na página inicial, o **cronograma oficial de 4h ou de 6h por dia** ou envia o dele. Os oficiais são
enviados em Word (.docx) pela equipe em **Equipe › Cronogramas** e ficam no bucket privado `cronogramas`, pasta
`oficiais/` (não são versionados aqui: são material do curso). A escolha de cada aluno fica em `study_plan_choices`
(migração 0016).

Em `/cronograma` o Word é lido no app (`lib/study-plan-view.ts`): o HTML é limpo (só formatação, tabelas e links
http/https, que abrem fora do app), dividido pelos títulos dos dias ("SEGUNDA-FEIRA"… "DOMINGO · SIMULADO") e, depois
dos dias, cada título vira um anexo (as trilhas por disciplina). As tabelas "ATIVIDADE n | TEMPO" viram a lista do dia,
com os links de cada atividade; "Questões do dia" abre primeiro o banco de questões do app nas disciplinas do dia.

## Vade Esperto

Um PDF por matéria no bucket privado `vade-esperto` (`<slug>.pdf`); a tabela `vade_esperto` guarda a data de atualização
que o aluno vê (migração 0017). O catálogo e o vínculo com o cronograma ("Vade Esperto – Processo Penal" → `processo-penal`)
estão em `lib/vade.ts`. O aluno abre em **Vade** (menu) ou direto pela atividade do cronograma; a equipe troca os PDFs em
**Equipe › Vade Esperto** (a data do nome do arquivo, "atualizado em 14.09.26", vira a data exibida).
