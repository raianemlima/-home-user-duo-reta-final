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
