"use client";

import { HIGHLIGHT_COLORS, type HighlightColor } from "@/lib/highlights/types";

// Barra que aparece com uma seleção: as 4 cores e "Anotar". No celular fica fixa no rodapé (longe do menu nativo).
export function HighlightToolbar({ onPick, onNote, onCancel }: { onPick: (color: HighlightColor) => void; onNote: () => void; onCancel: () => void }) {
  return <div className="highlight-toolbar" role="toolbar" aria-label="Grifar trecho selecionado" onMouseDown={(event) => event.preventDefault()}>
    {HIGHLIGHT_COLORS.map((color) => <button key={color.key} className="swatch-button" onClick={() => onPick(color.key)}><span className="swatch" style={{ background: color.swatch }} aria-hidden="true" />{color.label}</button>)}
    <button className="button ghost" onClick={onNote}>Anotar</button>
    <button className="icon-button" onClick={onCancel} aria-label="Cancelar">✕</button>
  </div>;
}

export function ColorLegend() {
  return <p className="color-legend">{HIGHLIGHT_COLORS.map((color) => <span key={color.key}><span className="swatch" style={{ background: color.swatch }} aria-hidden="true" />{color.label}</span>)}</p>;
}
