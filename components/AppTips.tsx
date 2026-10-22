"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { detectPlatform, type Platform, urlBase64ToUint8Array } from "@/lib/pwa";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type PushState = "unsupported" | "off" | "on" | "blocked";
const DISMISS_KEY = "duo-dica-instalar";
const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* navegador sem armazenamento: a dica só reaparece */ } };

const noSubscribe = () => () => undefined;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const currentPlatform = (): Platform => detectPlatform(navigator.userAgent, isStandalone(), navigator.maxTouchPoints);

// Dicas da tela inicial: instalar o app na tela inicial do celular e ligar os avisos de material novo.
export function AppTips() {
  const platform = useSyncExternalStore<Platform | null>(noSubscribe, currentPlatform, () => null);
  const storedDismissed = useSyncExternalStore(noSubscribe, () => read(DISMISS_KEY) === "1", () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  const hidden = storedDismissed || dismissedNow;
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [push, setPush] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const standalone = isStandalone();
    const detected = currentPlatform();
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(async (registration) => {
        const supported = "PushManager" in window && "Notification" in window && Boolean(VAPID_KEY) && (detected !== "ios" || standalone);
        if (!supported) return;
        if (Notification.permission === "denied") { setPush("blocked"); return; }
        const existing = await registration.pushManager.getSubscription();
        setPush(existing && Notification.permission === "granted" ? "on" : "off");
      }).catch(() => undefined);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function enable() {
    setBusy(true); setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setPush(permission === "denied" ? "blocked" : "off"); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription()) ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY as string) });
      const response = await fetch("/api/notificacoes/inscricao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error("Não foi possível ativar os avisos agora.");
      setPush("on");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível ativar os avisos agora."); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) { await fetch("/api/notificacoes/inscricao", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }); await subscription.unsubscribe(); }
      setPush("off");
    } catch { setError("Não foi possível desativar os avisos agora."); }
    finally { setBusy(false); }
  }
  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstallEvent(null);
  }
  function dismiss() { write(DISMISS_KEY, "1"); setDismissedNow(true); }

  if (!platform) return null;
  const showInstall = platform !== "installed" && !hidden;
  const iosNeedsInstall = platform === "ios";
  if (!showInstall && push === "unsupported") return null;
  return <details className="tips-fold"><summary>📱 Instale na tela inicial e ative os avisos</summary><section className="tips" aria-label="Dicas do app">
    {showInstall && <div className="tip-card">
      <p className="tip-title">📱 Use no celular, como um aplicativo</p>
      {platform === "ios" && <p>No iPhone, abra este site no <strong>Safari</strong>, toque em <strong>Compartilhar</strong> (o quadrado com a seta) e escolha <strong>Adicionar à Tela de Início</strong>. Depois é só abrir pelo ícone.</p>}
      {platform === "android" && <p>Instale para abrir direto da tela inicial, sem digitar o endereço. {installEvent ? "Toque no botão abaixo." : "No menu do navegador (⋮), escolha Instalar aplicativo ou Adicionar à tela inicial."}</p>}
      {platform === "other" && <p>No celular, abra este endereço no navegador e use o menu para <strong>Adicionar à tela inicial</strong>.</p>}
      <div className="sheet-actions">
        {platform === "android" && installEvent && <button className="button primary" onClick={install}>Instalar o app</button>}
        <button className="button ghost" onClick={dismiss}>Agora não</button>
      </div>
      {iosNeedsInstall && <p className="muted">Os avisos de material novo no iPhone funcionam depois de instalar o app na tela inicial.</p>}
    </div>}
    {push !== "unsupported" && <div className="tip-card">
      <p className="tip-title">🔔 Avisos de material novo</p>
      {push === "on" && <><p>Avisos ativados: você recebe uma notificação quando um arquivo novo chegar. Dá para baixar o PDF original dentro de cada disciplina.</p><div className="sheet-actions"><button className="button ghost" onClick={disable} disabled={busy}>Desativar avisos</button></div></>}
      {push === "off" && <><p>Receba uma notificação no celular quando um arquivo novo chegar.</p><div className="sheet-actions"><button className="button primary" onClick={enable} disabled={busy}>{busy ? "Ativando…" : "Ativar avisos"}</button></div></>}
      {push === "blocked" && <p>As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador ou do app para receber os avisos.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>}
  </section></details>;
}
