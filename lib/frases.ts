// Frase do dia na página inicial: motivação com bom humor para a reta final. Uma por dia (a mesma para todos os
// alunos), na ordem da lista; ao chegar ao fim, recomeça. Para incluir uma frase, basta acrescentá-la à lista.
export const FRASES: string[] = [
  "Defensor que se preze defende até o próprio cronograma. Hoje ele tem razão: siga-o.",
  "Seu sofá não vai passar na prova por você. Já tentou? Ele também não.",
  "Um informativo por dia mantém a eliminação longe.",
  "Café na mão, súmula na cabeça e o edital no radar. Bora!",
  "Quem estuda com constância não precisa de milagre, só de caneta marca-texto.",
  "Hoje não é dia de desistir. Amanhã também não. Depois de amanhã a gente vê… brincadeira: também não.",
  "Princípio da vedação ao retrocesso: estudou ontem? Hoje não pode parar.",
  "A posse é logo ali. O caminho passa pela Trilha de hoje.",
  "Errou uma questão? Ótimo: essa você não erra mais na prova.",
  "Você não precisa ser perfeito. Precisa ser frequente.",
  "Meta do dia: ser 1% melhor que ontem e 100% mais hidratado.",
  "A banca pode ser difícil. Você é persistente. Vantagem sua.",
  "Grifou? Anotou? Revisou? Então hoje já valeu.",
  "O cronograma é bússola, não algema. Mas aponte para o norte, por favor.",
  "Toda grande Defensora e todo grande Defensor já estiveram exatamente onde você está agora.",
  "Lei seca hoje, aprovação molhada de lágrimas de alegria amanhã.",
  "Preguiça é preliminar: rejeite e passe ao mérito.",
  "Sua futura assistida agradece cada página que você lê hoje.",
  "Estudar cansa. Ser aprovado descansa. Faça as contas.",
  "Questão difícil é só questão fácil que ainda não te conheceu.",
  "O segredo da aprovação é chato: sentar, estudar e repetir. Mas funciona.",
  "Dormiu bem? Comeu bem? Então hoje o cérebro está a seu favor. Aproveite.",
  "Sabe aquele artigo que você sempre esquece? Hoje é o dia dele.",
  "Nenhum Vade Mecum foi lido em um dia. Mas todos foram lidos um dia por vez.",
  "Hoje você estuda pelo concurso. Um dia você vai trabalhar por quem mais precisa. Vale cada minuto.",
  "Atenção: estudar com o celular virado para baixo aumenta a aprovação em 87%*. *Dado inventado, mas teste.",
  "Não compare o seu capítulo 3 com o capítulo 20 de ninguém.",
  "O domingo de recuperação existe. A segunda de recomeço também.",
  "Revisão não é repetição: é a matéria virando sua.",
  "Hoje a meta é simples: fazer o que dá, do jeito que dá, e anotar onde parou.",
  "A banca não sabe o quanto você estudou. Mas a sua nota vai contar para ela.",
  "Se a vontade de desistir bater, lembre do motivo que te fez começar.",
  "Ninguém cumpre 100% do cronograma. Mas quem cumpre 80% todo dia chega lá.",
  "Hoje tem questão, tem trilha e tem você. Equipe completa.",
  "Pequenas metas, grandes posses.",
  "Seja a pessoa que a sua versão de daqui a um ano vai agradecer.",
  "Falta de tempo se resolve com 25 minutos. Falta de começo se resolve agora.",
  "Estudar hoje é trabalho de base. Passar é consequência. Comemorar é obrigatório.",
  "Você está mais perto da aprovação do que estava ontem. Isso é matemática, não autoajuda.",
  "DUO lembra: água, pausa, alongamento. E depois mais uma questão.",
];

// Dia do ano no calendário de Brasília: muda à meia-noite para todos.
export function fraseDoDia(now: Date, frases: string[] = FRASES): string {
  const day = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const index = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return frases[((index % frases.length) + frases.length) % frases.length];
}
