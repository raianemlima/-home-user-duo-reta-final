"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_STUDY_PLAN_BYTES, type OfficialPlan, STUDY_PLAN_BUCKET } from "@/lib/study-plan";
import { api } from "@/components/staff/api";

type Plan = { plano: OfficialPlan; label: string; publicado: boolean; atualizadoEm: string | null };

// Cronogramas oficiais do DUO: a equipe envia o Word de 4h e o de 6h por dia; o aluno escolhe um e lê no app.
export function PlansPanel() {
  const [plans, setPlans] = useState<Plan[] | null>(null); const [busy, setBusy] = useState<OfficialPlan | null>(null);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const load = useCallback(() => { api<{ planos: Plan[] }>("/api/equipe/cronogramas").then((payload) => setPlans(payload.planos)).catch((failure: Error) => setError(failure.message)); }, []);
  useEffect(load, [load]);

  async function upload(plano: OfficialPlan, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setError(""); setMessage("");
    if (!file.name.toLowerCase().endsWith(".docx")) { setError("Envie o cronograma em Word (.docx)."); return; }
    if (file.size > MAX_STUDY_PLAN_BYTES) { setError("O arquivo passa de 10 MB."); return; }
    setBusy(plano);
    try {
      const target = await api<{ path: string; token: string; contentType: string }>("/api/equipe/cronogramas", { method: "POST", body: JSON.stringify({ plano, fileName: file.name, size: file.size }) });
      const { error: uploadError } = await createClient().storage.from(STUDY_PLAN_BUCKET).uploadToSignedUrl(target.path, target.token, file, { contentType: target.contentType, upsert: true });
      if (uploadError) throw new Error("O envio não terminou. Confira a conexão e tente de novo.");
      setMessage("Cronograma publicado ✓ Os alunos que o escolheram já veem a nova versão."); load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível enviar."); }
    finally { setBusy(null); }
  }

  return <div>
    <p className="eyebrow">Equipe Cursos DUO</p><h1>Cronogramas oficiais</h1>
    <p className="muted">Envie o cronograma em Word (.docx). O app separa os dias pelos títulos “SEGUNDA-FEIRA”, “TERÇA-FEIRA”… e mantém os links clicáveis. Enviar de novo substitui a versão anterior.</p>
    {plans && <ul className="discipline-grid">{plans.map((plan) => <li key={plan.plano} className="discipline-card">
      <span className="discipline-title">{plan.label}</span>
      <span className="discipline-meta">{plan.publicado ? `Publicado${plan.atualizadoEm ? ` em ${new Date(plan.atualizadoEm).toLocaleDateString("pt-BR")}` : ""}` : "Ainda não enviado: os alunos não veem esta opção."}</span>
      <label className={plan.publicado ? "button" : "button primary"}>{busy === plan.plano ? "Enviando…" : plan.publicado ? "Trocar arquivo" : "Enviar .docx"}<input type="file" accept=".docx" className="visually-hidden" disabled={busy !== null} onChange={(event) => upload(plan.plano, event)} /></label>
    </li>)}</ul>}
    {message && <p role="status">{message}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </div>;
}
