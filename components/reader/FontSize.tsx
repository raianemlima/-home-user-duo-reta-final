"use client";

const LEVELS = ["1", "2", "3"];

// Tamanho da letra do texto (3 passos), guardado só neste navegador.
export function FontSize() {
  function change(step: number) {
    const current = document.documentElement.dataset.font ?? "2";
    const next = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(current) + step))];
    document.documentElement.dataset.font = next;
    try { window.localStorage.setItem("duo-fonte", next); } catch { /* armazenamento indisponível */ }
  }
  return <span className="font-size" role="group" aria-label="Tamanho da letra"><button className="icon-button" onClick={() => change(-1)} aria-label="Diminuir letra">A−</button><button className="icon-button" onClick={() => change(1)} aria-label="Aumentar letra">A+</button></span>;
}
