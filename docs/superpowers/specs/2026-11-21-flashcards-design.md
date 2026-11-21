# Flashcards do aluno (estilo Anki)

## Por que
Na reta final, o aluno precisa lembrar do que leu, não só ler. Os flashcards transformam o que ele marca nos ebooks em revisão espaçada, como no Anki: o app traz de volta mais vezes o que ele erra e espaça o que ele já sabe.

## Objetivos
- O aluno cria cartões a partir de trechos que ele seleciona nos ebooks publicados.
- Dois formatos:
  - **Lacuna** (padrão): o aluno toca nas palavras do trecho que quer esconder;
  - **Pergunta e resposta**: o trecho vira o verso e o aluno escreve a pergunta.
- Revisão diária no estilo Anki, com os botões Errei / Difícil / Bom / Fácil e o próximo intervalo mostrado em cada botão.
- Funciona nos dois apps (DPE-SP e DPE-RN).

## Fora do escopo (decidido)
- Cartões gerados por IA ou pela equipe.
- Cartões automáticos a partir das questões.
- Compartilhar baralhos entre alunos; importar ou exportar para o Anki; imagens e áudio.

## Seria um fracasso se
- Criar um cartão no celular for trabalhoso, porque aí ninguém usa.
- O cartão ficar diferente do material, ou sumir quando o ebook for republicado.
- Um aluno conseguir ver os cartões de outro.

## Abordagens consideradas
1. **Baralho criado pelo aluno a partir do ebook (escolhida pela Raiane).** Não tem custo nem risco de erro de conteúdo, e o baralho fica pessoal.
2. Gerados por IA a partir dos ebooks. Descartado: custo, risco de erro jurídico e necessidade de revisão pela equipe.
3. Automáticos das questões erradas. Descartado por ora: a Raiane preferiu só o baralho do aluno.

## Como funciona

### Criar
- Na barra que aparece ao selecionar um trecho (hoje: cores e "Anotar"), entra o botão **"Flashcard"**.
- Ele abre uma janela com o trecho e duas abas:
  - **Lacuna**: as palavras do trecho viram botões, e tocar numa palavra esconde ou mostra essa palavra. Precisa de pelo menos uma lacuna.
  - **Pergunta**: um campo para a pergunta, e o trecho fica como resposta.
- Ao salvar, aparece o aviso "Cartão criado ✓". O trecho não precisa ser grifado.
- O servidor recalcula o texto a partir do material publicado: o cliente envia só as posições, como já é feito nos grifos.
- O cartão guarda uma **cópia do texto**, além da disciplina, da seção e do caminho do título. Por isso ele não muda nem some se o ebook for republicado. O link "Ver no material" leva à seção de origem enquanto ela existir.

### Revisar (nova página "Flashcards" no menu)
- Topo: "**12 para revisar hoje** · 30 cartões no total", um filtro por disciplina e o botão **Revisar**.
- Na revisão, um cartão por vez:
  - aparece a frente;
  - o aluno toca em **Mostrar resposta**;
  - aparecem o verso, a origem e os quatro botões com o intervalo de cada um, por exemplo "Errei <10 min · Difícil 1 d · Bom 3 d · Fácil 7 d".
- Ao terminar: "Revisão do dia concluída 🎉".
- Abaixo da revisão, a lista de cartões, com busca e as opções de editar (lacunas ou pergunta) e excluir.
- No Início, um cartão pequeno "Flashcards: N para revisar hoje" aparece quando há cartões vencidos.

### Agenda (simplificação do algoritmo do Anki)
- **Cartão novo**:
  - Errei: volta nesta mesma revisão;
  - Difícil: 1 dia;
  - Bom: 1 dia;
  - Fácil: 4 dias.
- **Depois disso**, cada cartão tem uma "facilidade", que começa em 2,5:
  - Errei: volta nesta revisão e no dia seguinte; a facilidade cai 0,2.
  - Difícil: intervalo × 1,2; a facilidade cai 0,15.
  - Bom: intervalo × facilidade.
  - Fácil: intervalo × facilidade × 1,3; a facilidade sobe 0,15.
  - A facilidade fica sempre entre 1,3 e 3.
- **Toque da reta final** (proposta minha): nenhum intervalo passa da data da prova. Assim, todo cartão aparece pelo menos uma vez antes dela. Sem data de prova (caso da DPE-RN), o limite é de 60 dias.
- "Hoje" segue o fuso de Brasília.

## Limites e segurança
- Uma tabela nova, `flashcards`, com RLS igual às outras tabelas do aluno: cada aluno só vê e altera os próprios cartões, e só com a matrícula ativa.
  - Na DPE-SP, a migração é a 0022; na DPE-RN, a 0023.
- Trecho com até 1.500 caracteres, pergunta com até 300, e até 3.000 cartões por aluno. A janela avisa quando um limite é passado.
- Sem a migração aplicada, a página mostra "Flashcards indisponíveis", como foi feito na Trilha dos Informativos.

## Deixado para quem implementar
- Detalhes visuais (seguir o verde DUO e os componentes que já existem).
- Como quebrar o trecho em palavras para as lacunas (palavras e pontuação; uma lacuna pode cobrir palavras seguidas).

## Testes
- Testes unitários da agenda (cada botão, limite da prova e facilidade mínima e máxima) e das rotas da API (validação, dono do cartão, limites).
- Testes de RLS na pasta tests/db.
- Teste e2e de ponta a ponta: selecionar um trecho, criar uma lacuna, revisar e responder Bom, e conferir que o cartão sai de "hoje".
