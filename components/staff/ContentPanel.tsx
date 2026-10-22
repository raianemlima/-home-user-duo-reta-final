"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { api, slugify, today } from "@/components/staff/api";
import { ensureNotDuplicate, fingerprintFile, suggestDocumentTitle, validateDocumentContent, validateDocumentFile } from "@/lib/document-import";
import { advanceJobStep, startJob } from "@/lib/pipeline/client";
import { createClient } from "@/lib/supabase/client";
import { uploadDocumentSecurely } from "@/lib/supabase/secure-documents";

export type Discipline = { id: string; slug: string; title: string; published: { id: string; label: string; publishedAt: string } | null; drafts: { id: string; label: string; createdAt: string }[] };
type Preview = { version: { id: string; label: string; status: string }; toc: { id: string; level: number; numbering: string | null; title: string | null }[]; stats: { sections: number; paragraphs: number; tips: number }; sample: { id: string; numbering: string | null; title: string | null; paragraphs: string[] }[] };
const label = (item: { numbering: string | null; title: string | null }) => [...new Set([item.numbering, item.title].filter(Boolean))].join(" ") || "Introdução";

// O mesmo arquivo já enviado antes (mesmo hash) é reaproveitado: o processamento é idempotente.
async function uploadOrReuse(file: File): Promise<string> {
  const format = validateDocumentFile(file);
  await validateDocumentContent(file, format);
  const sha256 = await fingerprintFile(file);
  const { data: existing } = await createClient().from("documents").select("id").eq("sha256", sha256).maybeSingle();
  if (existing?.id) return existing.id as string;
  ensureNotDuplicate(sha256, []);
  const document = await uploadDocumentSecurely({ file, metadata: { id: crypto.randomUUID(), title: suggestDocumentTitle(file.name), fileName: file.name, format, size: file.size, importedAt: new Date().toISOString(), projectId: null, sha256, extractionStatus: "text", extractedText: "", pageTexts: [], pageCount: 0 } });
  return document.id;
}

function PreviewPanel({ versionId, onDone }: { versionId: string; onDone: (message: string) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { api<Preview>(`/api/equipe/versoes/${versionId}`).then(setPreview).catch((failure: Error) => setError(failure.message)); }, [versionId]);
  async function publish() {
    setBusy(true); setError("");
    try { const result = await api<{ alreadyPublished: boolean; reanchored: number; orphaned: number }>(`/api/equipe/versoes/${versionId}/publicar`, { method: "POST" }); onDone(result.alreadyPublished ? "Esta versão já estava publicada." : `Versão publicada. Grifos dos alunos: ${result.reanchored} reposicionados, ${result.orphaned} marcados como "trecho alterado".`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao publicar."); setBusy(false); }
  }
  async function discard() {
    if (!window.confirm("Descartar este rascunho?")) return;
    setBusy(true);
    try { await api(`/api/equipe/versoes/${versionId}`, { method: "DELETE" }); onDone("Rascunho descartado."); } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao descartar."); setBusy(false); }
  }
  if (error) return <p className="auth-error" role="alert">{error}</p>;
  if (!preview) return <p className="muted">Carregando prévia…</p>;
  return <div className="staff-preview">
    <h3>Prévia: {preview.version.label}</h3>
    <p>{preview.stats.sections} seções · {preview.stats.paragraphs} parágrafos · {preview.stats.tips} caixas “DICA DUO”</p>
    <details><summary>Sumário detectado</summary><ol>{preview.toc.map((item) => <li key={item.id} style={{ marginLeft: `${Math.max(0, item.level - 1)}rem` }}>{label(item)}</li>)}</ol></details>
    {preview.sample.map((section) => <div key={section.id} className="staff-sample"><strong>{label(section)}</strong>{section.paragraphs.map((text, index) => <p key={index}>{text}</p>)}</div>)}
    <div className="sheet-actions"><button className="button primary" onClick={publish} disabled={busy}>{busy ? "Publicando…" : "Publicar para os alunos"}</button><button className="button danger" onClick={discard} disabled={busy}>Descartar</button></div>
  </div>;
}

export function DisciplineRow({ discipline, onChange }: { discipline: Discipline; onChange: () => void }) {
  const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false); const [preview, setPreview] = useState<string | null>(null); const [labelText, setLabelText] = useState(`Atualizado em ${today()}`);
  async function send(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      setStatus("Enviando o arquivo…");
      const documentId = await uploadOrReuse(file);
      setStatus("Processando (extração, limpeza e seções)…");
      const { view } = await startJob({ name: `${discipline.title} · ${file.name}`, documentIds: [documentId] });
      let state = view.job.status;
      for (let i = 0; i < 60 && state !== "succeeded" && state !== "failed"; i += 1) {
        const step = await advanceJobStep(view.job.id);
        state = step.view?.job.status ?? state;
        setStatus(`Processando… ${step.view?.progress.percent ?? 0}%`);
        if (step.outcome.kind === "waiting" || step.outcome.kind === "busy") await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (state !== "succeeded") throw new Error("O processamento falhou. Confira se o arquivo não é escaneado ou protegido por senha.");
      const { versionId } = await api<{ versionId: string }>("/api/equipe/versoes", { method: "POST", body: JSON.stringify({ disciplineId: discipline.id, jobId: view.job.id, label: labelText }) });
      setStatus(""); setPreview(versionId); onChange();
    } catch (failure) { setStatus(failure instanceof Error ? failure.message : "Falha no envio."); }
    finally { setBusy(false); }
  }
  // Excluir o publicado: mostra antes quantos grifos dos alunos serão apagados.
  async function removePublished() {
    const published = discipline.published;
    if (!published) return;
    setBusy(true); setStatus("");
    try {
      const impact = await api<{ highlights: number; students: number }>(`/api/equipe/versoes/${published.id}/impacto`);
      const loss = impact.highlights ? ` ${impact.highlights} grifo(s) de ${impact.students} aluno(s) serão apagados.` : " Nenhum aluno tem grifos nesta versão.";
      if (!window.confirm(`Excluir “${published.label}” de ${discipline.title}? Os alunos deixam de ver esta disciplina até você publicar uma nova versão.${loss} Esta ação não pode ser desfeita.`)) return;
      const result = await api<{ highlightsRemoved: number }>(`/api/equipe/versoes/${published.id}?confirmar=publicado`, { method: "DELETE" });
      setStatus(`Material excluído. ${result.highlightsRemoved} grifo(s) apagado(s).`); onChange();
    } catch (failure) { setStatus(failure instanceof Error ? failure.message : "Falha ao excluir."); }
    finally { setBusy(false); }
  }
  return <li className="staff-row">
    <div className="staff-row-head"><div><strong>{discipline.title}</strong><span className="muted"> /{discipline.slug}</span><p className="muted">{discipline.published ? `Publicado: ${discipline.published.label}` : "Ainda sem versão publicada"}</p></div>
      {discipline.published && <button className="button danger" onClick={removePublished} disabled={busy}>Excluir material publicado</button>}</div>
    {discipline.drafts.map((draft) => <p key={draft.id}>Rascunho “{draft.label}” <button className="button ghost" onClick={() => setPreview(draft.id)}>Revisar</button></p>)}
    <div className="staff-upload"><label>Rótulo da nova versão<input value={labelText} onChange={(event) => setLabelText(event.target.value)} maxLength={120} /></label><label className="button">{busy ? "Aguarde…" : "Enviar ebook (PDF ou DOCX)"}<input type="file" accept=".pdf,.docx" onChange={send} disabled={busy} className="visually-hidden" /></label></div>
    {status && <p role="status">{status}</p>}
    {preview && <PreviewPanel versionId={preview} onDone={(message) => { setPreview(null); setStatus(message); onChange(); }} />}
  </li>;
}

export function ContentPanel() {
  const [disciplines, setDisciplines] = useState<Discipline[] | null>(null); const [title, setTitle] = useState(""); const [slug, setSlug] = useState(""); const [error, setError] = useState("");
  const load = useCallback(() => { api<{ disciplines: Discipline[] }>("/api/equipe/disciplinas").then((payload) => setDisciplines(payload.disciplines)).catch((failure: Error) => setError(failure.message)); }, []);
  useEffect(load, [load]);
  async function create(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await api("/api/equipe/disciplinas", { method: "POST", body: JSON.stringify({ title, slug: slug || slugify(title) }) }); setTitle(""); setSlug(""); load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao criar."); }
  }
  return <div>
    <p className="eyebrow">Equipe</p><h1>Conteúdo</h1>
    <p className="muted">Cada disciplina tem uma versão publicada. Envie o ebook, confira a prévia e publique; os grifos dos alunos são reposicionados automaticamente.</p>
    <form className="notebook-filters" onSubmit={create}><label>Nova disciplina<input value={title} onChange={(event) => { setTitle(event.target.value); setSlug(slugify(event.target.value)); }} placeholder="Direito Penal" required /></label><label>Endereço<input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="direito-penal" /></label><button className="button primary" type="submit">Criar</button></form>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {!disciplines ? <p className="muted">Carregando…</p> : <ul className="staff-list">{disciplines.map((discipline) => <DisciplineRow key={discipline.id} discipline={discipline} onChange={load} />)}</ul>}
  </div>;
}
