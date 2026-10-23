"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_STUDY_PLAN_BYTES, OFFICIAL_PLANS, type OfficialPlan, type PlanChoice, STUDY_PLAN_ACCEPT, STUDY_PLAN_BUCKET, WEEKDAY_NAMES } from "@/lib/study-plan";

type PlanFile = { name: string; size: number | null; updatedAt: string | null };
type PlanState = { plano: PlanChoice | null; oficiais: Record<OfficialPlan, boolean>; file: PlanFile | null };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? "Não foi possível concluir. Tente de novo.");
  return payload as T;
}

// "Meu cronograma": o aluno segue o cronograma oficial de 3h, 4h ou 6h por dia, ou envia o dele, e vê no app o que estudar hoje.
export function StudyPlan() {
  const [state, setState] = useState<PlanState | null | undefined>(undefined);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const load = useCallback(() => { call<PlanState>("/api/cronograma").then(setState).catch(() => setState(null)); }, []);
  useEffect(load, [load]);

  async function choose(plano: PlanChoice) {
    setBusy(true); setError(""); setMessage("");
    try { await call("/api/cronograma/plano", { method: "PUT", body: JSON.stringify({ plano }) }); setMessage("Cronograma escolhido ✓"); load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar a escolha."); }
    finally { setBusy(false); }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]; event.target.value = "";
    if (!chosen) return;
    setError(""); setMessage("");
    if (chosen.size > MAX_STUDY_PLAN_BYTES) { setError("O arquivo passa de 10 MB. Envie uma versão menor."); return; }
    setBusy(true);
    try {
      const target = await call<{ path: string; token: string; contentType: string }>("/api/cronograma", { method: "POST", body: JSON.stringify({ fileName: chosen.name, size: chosen.size }) });
      const { error: uploadError } = await createClient().storage.from(STUDY_PLAN_BUCKET).uploadToSignedUrl(target.path, target.token, chosen, { contentType: target.contentType, upsert: true });
      if (uploadError) throw new Error("O envio não terminou. Confira a conexão e tente de novo.");
      await call("/api/cronograma/plano", { method: "PUT", body: JSON.stringify({ plano: "proprio" }) });
      setMessage("Cronograma salvo ✓"); load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível enviar o cronograma."); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(""); setMessage("");
    try { await call("/api/cronograma", { method: "DELETE" }); setMessage("Cronograma removido."); load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível remover."); }
    finally { setBusy(false); }
  }

  if (state === undefined) return null;
  const plano = state?.plano ?? null;
  const today = WEEKDAY_NAMES[new Date().getDay()].toLowerCase();
  const picker = (label: string) => <label className="button">{busy ? "Enviando…" : label}<input type="file" accept={STUDY_PLAN_ACCEPT} onChange={upload} disabled={busy} className="visually-hidden" /></label>;
  const options = (Object.keys(OFFICIAL_PLANS) as OfficialPlan[]).filter((key) => state?.oficiais[key]);
  return <section className="plan-card" aria-labelledby="meu-cronograma">
    <h2 id="meu-cronograma" className="section-title" style={{ margin: 0 }}>📅 Meu cronograma de estudos</h2>
    {plano && <Link className="button primary plan-today" href="/cronograma">Ver o que estudar hoje ({today}) →</Link>}
    <fieldset className="plan-choice" disabled={busy}>
      <legend className="muted">{plano ? "Cronograma que você segue" : "Escolha o cronograma que vai seguir"}</legend>
      {options.map((key) => <label key={key} className={`plan-option${plano === key ? " is-on" : ""}`}><input type="radio" name="plano" checked={plano === key} onChange={() => choose(key)} />{OFFICIAL_PLANS[key].label}</label>)}
      {state?.file
        ? <label className={`plan-option${plano === "proprio" ? " is-on" : ""}`}><input type="radio" name="plano" checked={plano === "proprio"} onChange={() => choose("proprio")} />Meu cronograma: <strong>{state.file.name}</strong></label>
        : <p className="muted">{options.length ? "Ou envie o seu" : "Envie o seu"} (Word para ler no app; PDF, imagem, Excel ou CSV para abrir), até 10 MB. Só você vê este arquivo.</p>}
    </fieldset>
    <div className="sheet-actions">
      {state?.file ? <>{picker("Trocar meu arquivo")}<a className="button" href="/api/cronograma/arquivo" target="_blank" rel="noopener">Baixar meu arquivo</a><button className="button danger" onClick={remove} disabled={busy}>Remover meu arquivo</button></> : picker("Enviar meu cronograma")}
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>;
}
