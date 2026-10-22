"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("As duas senhas precisam ser iguais."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/conta/senha", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? "Não foi possível trocar a senha.");
      router.replace("/"); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível trocar a senha."); setBusy(false); }
  }
  return <main className="auth-page"><div className="auth-card">
    <span className="auth-logo" aria-hidden="true" /><p className="eyebrow">PRIMEIRO ACESSO</p><h1>Crie sua senha</h1>
    <p className="muted">Por segurança, troque a senha inicial por uma só sua. Você usará essa senha nos próximos acessos.</p>
    <form onSubmit={submit} className="auth-form">
      <label>Nova senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required /></label>
      <label>Repita a nova senha<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required /></label>
      <p className="auth-footnote" style={{ textAlign: "left" }}>Mínimo de {MIN_PASSWORD_LENGTH} caracteres.</p>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="button primary full" type="submit" disabled={busy || !password}>{busy ? "Salvando…" : "Salvar e entrar"}</button>
    </form>
  </div></main>;
}
