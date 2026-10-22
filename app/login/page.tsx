"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LOGIN_REASONS, loginMessage } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/client";

// Só caminhos internos: evita redirecionamento aberto via ?next=.
const safeNext = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/");

function LoginForm() {
  const router = useRouter(); const params = useSearchParams();
  const next = safeNext(params.get("next")); const reason = LOGIN_REASONS[params.get("motivo") ?? ""];
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [sent, setSent] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function sendLink(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const { error: otpError } = await createClient().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}` } }); setSent(loginMessage(otpError)); }
    catch { setSent(loginMessage(null)); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const { error: verifyError } = await createClient().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" }); if (verifyError) throw verifyError; router.replace(next); router.refresh(); }
    catch { setError("Código inválido ou expirado. Confira o e-mail ou peça um novo código."); }
    finally { setBusy(false); }
  }
  return <div className="auth-card">
    <span className="auth-logo" aria-hidden="true" /><p className="eyebrow">CURSOS DUO · RETA FINAL DPE-SP</p><h1>Entrar no app de estudo</h1>
    {reason && <p className="auth-notice" role="status">{reason}</p>}
    {!sent ? <form onSubmit={sendLink} className="auth-form"><label>E-mail da sua matrícula<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" required /></label><button className="button primary full" type="submit" disabled={busy}>{busy ? "Enviando…" : "Receber link de acesso"}</button></form>
      : <form onSubmit={verify} className="auth-form"><p className="auth-sent" role="status">{sent}</p><label>Código de 6 dígitos<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" pattern="\d{6}" required /></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="button primary full" type="submit" disabled={busy || code.length !== 6}>{busy ? "Entrando…" : "Entrar"}</button><button className="button ghost full" type="button" onClick={() => { setSent(""); setCode(""); setError(""); }}>Usar outro e-mail</button></form>}
    <p className="auth-footnote">Você também pode tocar no link enviado por e-mail. <a href="/privacidade">Privacidade</a></p>
  </div>;
}

export default function LoginPage() {
  return <main className="auth-page"><Suspense fallback={null}><LoginForm /></Suspense></main>;
}
