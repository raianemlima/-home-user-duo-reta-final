"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Hit = { sectionId: string; sectionTitle: string | null; snippet: string };

export function SearchBox({ slug }: { slug: string }) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<Hit[] | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (q.trim().length < 3) { setError("Digite pelo menos 3 letras."); return; }
    setBusy(true); setError("");
    try { const response = await fetch(`/api/busca?disciplina=${encodeURIComponent(slug)}&q=${encodeURIComponent(q)}`); if (!response.ok) throw new Error(); setHits((await response.json()).results); }
    catch { setError("Não foi possível buscar agora. Tente de novo."); }
    finally { setBusy(false); }
  }
  return <div className="search-box">
    <form onSubmit={submit} role="search"><label className="visually-hidden" htmlFor="busca">Buscar nesta disciplina</label><input id="busca" type="search" placeholder="Buscar nesta disciplina" value={q} onChange={(event) => setQ(event.target.value)} /><button className="button" type="submit" disabled={busy}>Buscar</button></form>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {hits && <div className="search-results" role="status">{hits.length ? <ul>{hits.map((hit, index) => <li key={`${hit.sectionId}-${index}`}><Link href={`/disciplinas/${slug}/${hit.sectionId}`} onClick={() => setHits(null)}><strong>{hit.sectionTitle ?? "Introdução"}</strong><span>{hit.snippet}</span></Link></li>)}</ul> : <p>Nada encontrado.</p>}<button className="button ghost" onClick={() => setHits(null)}>Fechar resultados</button></div>}
  </div>;
}
