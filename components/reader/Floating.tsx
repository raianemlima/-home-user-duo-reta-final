"use client";

import { PointerEvent, ReactNode, useRef, useState } from "react";

// Painel flutuante: a alça (⠿) arrasta o painel para qualquer ponto da tela, sem tapar o trecho que o aluno está lendo.
export function Floating({ className, children, ...aria }: { className: string; children: ReactNode; role?: string; "aria-label"?: string; onMouseDown?: (event: React.MouseEvent) => void }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  function move(event: PointerEvent<HTMLElement>) {
    if (!start.current) return;
    let x = start.current.ox + event.clientX - start.current.x, y = start.current.oy + event.clientY - start.current.y;
    const rect = panel.current?.getBoundingClientRect();
    if (rect) {
      // Mantém o painel dentro da janela: a alça nunca fica fora de alcance.
      const left = rect.left + (x - offset.x), top = rect.top + (y - offset.y);
      if (left < 0) x -= left;
      if (left + rect.width > window.innerWidth) x -= left + rect.width - window.innerWidth;
      if (top < 0) y -= top;
      if (top + 44 > window.innerHeight) y -= top + 44 - window.innerHeight;
    }
    setOffset({ x, y });
  }
  return <div className={className} ref={panel} style={{ "--dx": `${offset.x}px`, "--dy": `${offset.y}px` } as React.CSSProperties} {...aria}>
    <div className="drag-handle" role="presentation" title="Arraste para mover"
      onPointerDown={(event) => { start.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={move} onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}>
      <span aria-hidden="true">⠿</span><span className="visually-hidden">Arraste para mover o painel</span>
    </div>
    {children}
  </div>;
}
