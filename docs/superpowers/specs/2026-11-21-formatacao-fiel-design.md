# Leitura fiel ao PDF: negritos, citações e cores

## Por que
No PDF, os ebooks DUO têm negrito, itálico e sublinhado no meio das frases; citações de jurisprudência e de lei com recuo; listas com ✔; títulos verdes com letras espaçadas; caixas coloridas como "DE OLHO NO EXAMINADOR"; e texto justificado. No app, hoje, sai só o texto corrido. A Raiane quer que a leitura no app seja quase uma reprodução fiel do PDF, mas que continue se ajustando à tela do celular.

## Objetivos
- Reproduzir no leitor, a partir do PDF original de cada ebook:
  - **negrito**, *itálico*, sublinhado e a **cor** do texto (verde dos títulos, azul dos links, outras cores do material);
  - **recuo** de parágrafo (citações de jurisprudência e de lei, itens de lista);
  - **marcador de lista** (✔, •, a./b.) quando o PDF o desenha como símbolo;
  - **caixa com fundo colorido** em volta do parágrafo, como "DE OLHO NO EXAMINADOR" e outras caixas do material.
- Texto **justificado** e títulos no estilo do PDF (verde, com letras espaçadas), para todos os ebooks.
- Os ebooks **já publicados** ganham a formatação sem nova publicação.
- Os ebooks **enviados daqui em diante** já saem formatados.
- Vale para os dois apps (DPE-SP e DPE-RN).

## Fora do escopo
- A aparência de página: cabeçalho e rodapé do PDF, número de página, margens.
- Os Vade Espertos em Word: podem entrar depois, pelo mesmo caminho, com a leitura do Word.
- Fonte idêntica à do PDF: o app continua com a fonte do DUO (Arimo, parecida com a Arial).

## Seria um fracasso se
- Algum grifo, anotação ou flashcard de aluno mudasse de lugar ou sumisse.
- O texto ficasse ilegível no tema escuro, por exemplo um verde-escuro sobre o fundo escuro.
- No celular aparecesse rolagem lateral, por exemplo com recuos grandes demais.
- Uma falha na formatação impedisse a publicação de um ebook. A formatação é um extra: se falhar, o ebook sai como hoje.

## Abordagens consideradas
- **A) Formatação guardada à parte do texto. Escolhida pela Raiane.** Uma leitura nova do PDF pega fonte, cor, posição e retângulos desenhados. Essa formatação é encaixada no texto que já foi publicado. O texto não muda, então os grifos não se mexem.
- B) Refazer toda a extração já com formatação e republicar os ebooks. Descartada: obriga a reposicionar os grifos, e alguns podem se perder.
- C) Mostrar a página do PDF dentro do app. Descartada: no celular o texto não se ajusta à tela, e perde grifo, flashcard e busca.

## Como funciona

### 1. Ler a formatação do PDF (`lib/formatting/pdf-styles.ts`)
- O pdf.js abre o arquivo com `fontExtraProperties: true`, o que dá o nome real da fonte. "Arial-BoldMT" é negrito, "Arial-ItalicMT" é itálico; também valem os nomes com Bold/Black/Heavy/Semibold e Italic/Oblique.
- A **cor** de cada trecho vem da lista de operações de desenho, pela cor de preenchimento ativa quando o texto é desenhado.
- O **sublinhado** vem das linhas finas desenhadas logo abaixo de um trecho (até 1,5 pt de altura e da mesma largura).
- As **caixas** vêm dos retângulos preenchidos, e não brancos, que contêm o parágrafo.
- O **recuo** vem da posição horizontal da primeira linha e das seguintes, comparada com a margem esquerda da página.
- O **marcador de lista** vem de um trecho de fonte de símbolo (por exemplo, Segoe UI Emoji ou Wingdings) no começo da linha.
- O resultado são linhas de texto com trechos estilizados, página a página, em ordem de leitura.

### 2. Encaixar no texto publicado (`lib/formatting/align.ts`)
- Cada parágrafo publicado é procurado, em ordem, no texto estilizado. A comparação ignora diferenças de espaço e de hífen de quebra de linha, além do que a limpeza removeu, como as marcas d'água.
- Cada letra do parágrafo herda o estilo da letra correspondente no PDF. Trechos seguidos de mesmo estilo viram uma marca: `[início, fim, estilo]`.
- Um parágrafo que não for encontrado fica sem formatação, como hoje, e nunca com formatação errada.
- Tabelas ficam fora nesta etapa: elas já têm desenho próprio.

### 3. Guardar (migração `paragraphs.format`)
- Uma coluna nova, `paragraphs.format jsonb null`, com este formato:
  `{ marks?: [[início, fim, "b"|"i"|"u"|"bi"…, cor?]], indent?: 1–4, bullet?: "check"|"dot"|null, box?: "#hex" }`
- O texto, o `hash` e as posições não mudam.
- A cor só é guardada quando é diferente da cor normal do corpo do texto.

### 4. Aplicar
- **Ebooks novos:** logo depois de o rascunho ser criado, o app lê o PDF original (que já fica guardado) e grava a formatação. Se falhar, registra um aviso e segue.
- **Ebooks já publicados:** em Equipe › Conteúdo, entra o botão **"Aplicar formatação do PDF"**. Ele processa um ebook por vez e mostra o resultado, por exemplo "Direito Constitucional: 1.240 de 1.310 parágrafos formatados".
  - A Raiane só precisa clicar uma vez em cada app.
  - Pode repetir sem problema, porque cada vez a formatação é recalculada e substituída.

### 5. Mostrar (leitor)
- O texto de cada parágrafo é dividido também nos limites das marcas e envolvido em `<strong>`, `<em>`, `<u>` ou num trecho com cor.
- Os grifos continuam funcionando, porque a posição do cursor é contada pelo texto, e não pelas tags.
- **Cores no tema escuro:** cada cor do PDF é clareada até ficar legível sobre o fundo escuro (contraste de pelo menos 4,5:1). No tema claro, a cor é escurecida se não passar desse contraste sobre o fundo claro.
- **Recuo:** `padding-left` de 1,5 em por nível no computador; no celular, no máximo 2 níveis.
- **Caixa:** fundo na cor do PDF no tema claro; no escuro, um fundo escuro com borda na cor original.
- **Marcador:** ✔ ou • desenhado antes do parágrafo, sem entrar no texto.
- Texto justificado com hifenização em português (`lang="pt-BR"`) e títulos das seções em verde DUO com letras espaçadas.

## Testes
- Leitura da formatação com um PDF gerado no teste, com negrito, itálico, cor, sublinhado e caixa: cada trecho com o estilo certo.
- Encaixe:
  - parágrafo com hífen de quebra de linha e espaços diferentes;
  - parágrafo que não existe no PDF fica sem formatação;
  - as marcas nunca passam do fim do texto.
- Ensaio com o PDF real de Constitucional (já usado nos testes de tabela): conferir que "vínculo jurídico-político entre uma pessoa e o Estado" sai em negrito e "Jus soli" em itálico.
- Leitor: um parágrafo com marcas e um grifo por cima. O grifo continua no mesmo lugar, e selecionar texto dentro do negrito dá as posições certas.
- Tema escuro: contraste das cores conferido no teste e com o axe no e2e.
- Migração, com o teste de banco.

## Deixado para quem implementar
- Os limites exatos de recuo e a tolerância do sublinhado, ajustados olhando o PDF de Constitucional e o de Penal.
- O formato compacto do JSON das marcas.
