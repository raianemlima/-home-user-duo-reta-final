"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_STUDY_PLAN_BYTES, STUDY_PLAN_ACCEPT, STUDY_PLAN_BUCKET } from "@/lib/study-plan";

type PlanFile = { name: string; size: number | null; updatedAt: string | null };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? "Não foi possível concluir. Tente de novo.");
  return payload as T;
}

// "Meu cronograma": o aluno envia o próprio cronograma de estudos (um arquivo) e o abre de qualquer aparelho.
export function StudyPlan() {
  const [file, setFile] = useState<PlanFile | null | undefined>(undefined);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const load = useCallback(() => { call<{ file: PlanFile | null }>("/api/cronograma").then((payload) => setFile(payload.file)).catch(() => setFile(null)); }, []);
  useEffect(load, [load]);

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

  if (file === undefined) return null;
  const picker = (label: string, primary: boolean) => <label className={primary ? "button primary" : "button"}>{busy ? "Enviando…" : label}<input type="file" accept={STUDY_PLAN_ACCEPT} onChange={upload} disabled={busy} className="visually-hidden" /></label>;
  return <section className="plan-card" aria-labelledby="meu-cronograma">
    <h2 id="meu-cronograma" className="section-title" style={{ margin: 0 }}>📅 Meu cronograma de estudos</h2>
    {file ? <>
      <div className="plan-file"><strong>{file.name}</strong>{file.updatedAt && <span className="muted">enviado em {new Date(file.updatedAt).toLocaleDateString("pt-BR")}</span>}</div>
      <div className="sheet-actions"><a className="button primary" href="/api/cronograma/arquivo" target="_blank" rel="noopener">Abrir cronograma</a>{picker("Trocar arquivo", false)}<button className="button danger" onClick={remove} disabled={busy}>Remover</button></div>
    </> : <>
      <p className="muted">Envie seu cronograma (PDF, imagem, Word, Excel ou CSV, até 10 MB) para tê-lo à mão no celular e no computador. Só você vê este arquivo.</p>
      <div className="sheet-actions">{picker("Enviar cronograma", true)}</div>
    </>}
    {message && <p role="status">{message}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>;
}
