"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/components/staff/api";

type Student = { user_id: string; email: string; name: string; role: string; active: boolean };
type Report = { invited: string[]; reactivated: string[]; invalid: string[]; duplicates: string[]; failed: { email: string; reason: string }[] };

export function StudentsPanel() {
  const [students, setStudents] = useState<Student[] | null>(null); const [list, setList] = useState(""); const [report, setReport] = useState<Report | null>(null); const [query, setQuery] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = useCallback(() => { api<{ students: Student[] }>("/api/equipe/alunos").then((payload) => setStudents(payload.students)).catch((failure: Error) => setError(failure.message)); }, []);
  useEffect(load, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setReport(null);
    try { setReport(await api<Report>("/api/equipe/alunos", { method: "POST", body: JSON.stringify({ list }) })); setList(""); load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao cadastrar."); }
    finally { setBusy(false); }
  }
  async function toggle(student: Student) {
    try { await api(`/api/equipe/alunos/${student.user_id}`, { method: "PATCH", body: JSON.stringify({ active: !student.active }) }); load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao alterar."); }
  }
  const visible = (students ?? []).filter((student) => !query || student.email.includes(query.toLowerCase()) || student.name.toLowerCase().includes(query.toLowerCase()));
  return <div>
    <p className="eyebrow">Equipe</p><h1>Alunos</h1>
    <form onSubmit={submit} className="auth-form"><label>Cole a lista de e-mails (um por linha, ou “Nome &lt;email&gt;”)<textarea rows={6} value={list} onChange={(event) => setList(event.target.value)} required /></label><button className="button primary" type="submit" disabled={busy}>{busy ? "Enviando convites…" : "Cadastrar e enviar convites"}</button></form>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {report && <div className="staff-report" role="status">
      <p><strong>{report.invited.length}</strong> convidados · <strong>{report.reactivated.length}</strong> reativados</p>
      {report.invalid.length > 0 && <p>Linhas inválidas: {report.invalid.join(", ")}</p>}
      {report.duplicates.length > 0 && <p>Repetidos na lista: {report.duplicates.join(", ")}</p>}
      {report.failed.length > 0 && <p>Não enviados: {report.failed.map((item) => `${item.email} (${item.reason})`).join("; ")}</p>}
    </div>}
    <h2>Cadastrados ({students?.length ?? 0})</h2>
    <input type="search" placeholder="Buscar por e-mail ou nome" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar aluno" />
    <ul className="staff-list">{visible.map((student) => <li key={student.user_id} className="staff-row staff-student"><span><strong>{student.email}</strong>{student.name && ` · ${student.name}`}{student.role === "equipe" && <span className="badge">equipe</span>}</span><button className={student.active ? "button" : "button primary"} onClick={() => toggle(student)}>{student.active ? "Desativar" : "Reativar"}</button></li>)}</ul>
  </div>;
}
