"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LOGIN_FAILED_MESSAGE, LOGIN_REASONS } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/client";

// Só caminhos internos: evita redirecionamento aberto via ?next=.
const safeNext = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/");

function LoginForm() {
  const router = useRouter(); const params = useSearchParams();
  const next = safeNext(params.get("next")); const reason = LOGIN_REASONS[params.get("motivo") ?? ""];
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const { error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password }); if (signInError) throw signInError; await fetch("/api/conta/sessao", { method: "POST" }).catch(() => undefined); router.replace(next); router.refresh(); }
    catch { setError(LOGIN_FAILED_MESSAGE); }
    finally { setBusy(false); }
  }
  return <div className="auth-card">
    <span className="auth-logo" aria-hidden="true" /><p className="eyebrow">CURSOS DUO · RETA FINAL DPE-SP</p><h1>Entrar no app de estudo</h1>
    {reason && <p className="auth-notice" role="status">{reason}</p>}
    <form onSubmit={signIn} className="auth-form">
      <label>E-mail da sua matrícula<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" required /></label>
      <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="button primary full" type="submit" disabled={busy || !password}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
    <p className="auth-footnote"><a href="/privacidade">Privacidade</a></p>
  </div>;
}

export default function LoginPage() {
  return <main className="auth-page"><Suspense fallback={null}><LoginForm /></Suspense></main>;
}
