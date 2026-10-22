"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const current = (): Theme => {
  const chosen = document.documentElement.dataset.theme;
  return chosen === "dark" || chosen === "light" ? chosen : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, current, () => null);
  function toggle() {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("duo-tema", next); } catch { /* armazenamento indisponível: vale só nesta visita */ }
    listeners.forEach((listener) => listener());
  }
  return <button className="icon-button" type="button" onClick={toggle} aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"} title="Alternar tema">{theme === "dark" ? "☀" : "☾"}</button>;
}
