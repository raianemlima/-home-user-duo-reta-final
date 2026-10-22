"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_VADE_BYTES, VADE_BUCKET } from "@/lib/vade";
import { api } from "@/components/staff/api";
import { type Discipline, DisciplineRow } from "@/components/staff/ContentPanel";

type Material = { slug: string; titulo: string; versao: string; atualizadoEm: string | null; disponivel: boolean };
// "Vade Esperto - CPP - atualizado em 14.09.26.pdf" → "atualizado em 14.09.26": vira a data que o aluno vê.
const versionFrom = (fileName: string) => { const date = /atualiza\w*\s*(?:em\s*)?([\d.]+\d)/i.exec(fileName)?.[1]; return date ? `Atualizado em ${date}` : ""; };

// Vade Esperto: um PDF por matéria; enviar de novo substitui o anterior.
export function VadePanel() {
  const [materials, setMaterials] = useState<Material[] | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const load = useCallback(() => {
    api<{ materiais: Material[] }>("/api/equipe/vade-esperto").then((payload) => setMaterials(payload.materiais)).catch((failure: Error) => setError(failure.message));
    api<{ disciplines: Discipline[] }>("/api/equipe/disciplinas").then((payload) => setDisciplines(payload.disciplines)).catch((failure: Error) => setError(failure.message));
  }, []);
  useEffect(load, [load]);

  async function upload(slug: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setError(""); setMessage("");
    if (!file.name.toLowerCase().endsWith(".pdf")) { setError("Envie o Vade Esperto em PDF."); return; }
    if (file.size > MAX_VADE_BYTES) { setError("O PDF passa de 25 MB."); return; }
    setBusy(slug);
    try {
      const target = await api<{ path: string; token: string }>("/api/equipe/vade-esperto", { method: "POST", body: JSON.stringify({ slug, fileName: file.name, size: file.size }) });
      const { error: uploadError } = await createClient().storage.from(VADE_BUCKET).uploadToSignedUrl(target.path, target.token, file, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw new Error("O envio não terminou. Confira a conexão e tente de novo.");
      await api("/api/equipe/vade-esperto", { method: "PUT", body: JSON.stringify({ slug, versao: versionFrom(file.name) }) });
      setMessage("Vade Esperto publicado ✓"); load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível enviar."); }
    finally { setBusy(null); }
  }

  return <div>
    <p className="eyebrow">Equipe Cursos DUO</p><h1>Vade Esperto</h1>
    <p className="muted">Cada matéria tem dois envios: o <strong>Word (.docx)</strong> vai para o leitor do app, com grifos, anotações e caderno (é o que o aluno abre em “Ler no app” e pelo cronograma); o <strong>PDF</strong> fica para abrir em outra janela ou baixar. A data do nome do arquivo (“atualizado em 14.09.26”) aparece para o aluno.</p>
    {materials && <ul className="staff-list">{materials.map((material) => {
      const reader = disciplines.find((discipline) => discipline.slug === `vade-esperto-${material.slug}`);
      return <li key={material.slug} className="vade-staff">
        <h2 className="section-title">{material.titulo}</h2>
        <div className="vade-staff-part">
          <p><strong>1. Leitor do app (Word)</strong> — {reader?.published ? `publicado: ${reader.published.label}` : "ainda não publicado"}</p>
          {reader ? <DisciplineRow discipline={reader} onChange={load} /> : <p className="muted">Carregando…</p>}
        </div>
        <div className="vade-staff-part">
          <p><strong>2. PDF para abrir ou baixar</strong> — {material.disponivel ? material.versao || "publicado" : "ainda não enviado"}</p>
          <label className="button">{busy === material.slug ? "Enviando…" : material.disponivel ? "Trocar PDF" : "Enviar PDF"}<input type="file" accept=".pdf,application/pdf" className="visually-hidden" disabled={busy !== null} onChange={(event) => upload(material.slug, event)} /></label>
        </div>
      </li>;
    })}</ul>}
    {message && <p role="status">{message}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </div>;
}
