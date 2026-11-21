"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { callApi } from "@/lib/flashcards/client";

// Aviso no Início quando há flashcards vencidos hoje. Some quando não há (ou quando a função não está disponível).
export function HomeFlashcards() {
  const [due, setDue] = useState(0);
  useEffect(() => {
    let alive = true;
    callApi<{ disponivel: boolean; paraHoje: number }>("/api/flashcards?resumo=1").then((payload) => { if (alive && payload.disponivel) setDue(payload.paraHoje); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!due) return null;
  return <Link className="flash-home" href="/flashcards"><span aria-hidden="true">🃏</span><span><strong>Flashcards:</strong> {due} {due === 1 ? "cartão" : "cartões"} para revisar hoje</span><span className="flash-home-go">Revisar →</span></Link>;
}
