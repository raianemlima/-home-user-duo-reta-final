import { maskPieces } from "@/lib/flashcards/cloze";
import type { Card } from "@/lib/flashcards/client";

// Frente ou verso de um cartão. Lacuna: na frente, as palavras escondidas viram "[ … ]"; no verso, aparecem destacadas.
export function CardFace({ card, side }: { card: Pick<Card, "tipo" | "texto" | "pergunta" | "lacunas">; side: "frente" | "verso" }) {
  if (card.tipo === "pergunta") return side === "frente"
    ? <p className="flash-text flash-question">{card.pergunta}</p>
    : <><p className="flash-text flash-question">{card.pergunta}</p><blockquote className="flash-quote flash-text">{card.texto}</blockquote></>;
  return <p className="flash-text">{maskPieces(card.texto, card.lacunas).map((piece, index) => piece.gap
    ? side === "frente" ? <span key={index} className="flash-gap" aria-label="lacuna">[ … ]</span> : <mark key={index} className="flash-answer">{piece.text}</mark>
    : <span key={index}>{piece.text}</span>)}</p>;
}
