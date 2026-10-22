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
| `SUPABASE_SERVICE_ROLE_KEY` | só servidor | convites de alunos e reancoragem de grifos |

Os ebooks do curso **não** são versionados neste repositório (direitos autorais).

## Publicar (Supabase + Vercel)

1. **Supabase**: crie um projeto só para o DUO. Aplique as migrações em ordem (`supabase/migrations/0001…0009`, sem os arquivos `.down`
   e **sem a 0005**, que o próprio atelie marca como não aplicada: ela exige que o envio de documentos use a chave de serviço).
   Projeto atual: `duo-reta-final` (`https://xslqdunmykikmslgntqz.supabase.co`, região São Paulo), já com 0001–0004 e 0006–0009.
2. **Auth** (Authentication → Providers/Settings):
   - desligue o cadastro aberto ("Allow new users to sign up");
   - em URL Configuration, adicione `https://SEU_DOMINIO/auth/confirm` às Redirect URLs;
   - nos modelos de e-mail "Magic Link" e "Invite", inclua o código `{{ .Token }}` e o link
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (convite: `type=invite`).
3. **Primeiro usuário da equipe**: convide pelo painel do Supabase e rode no SQL Editor:
   `insert into public.profiles(user_id, email, role) select id, email, 'equipe' from auth.users where email = 'equipe@cursosduo.com.br';`
4. **Vercel**: importe o repositório e defina `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `NEXT_PUBLIC_PIPELINE_V2=true` e `SUPABASE_SERVICE_ROLE_KEY` (esta só no servidor).
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
