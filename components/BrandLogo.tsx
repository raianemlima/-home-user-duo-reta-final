import Image from "next/image";

// Pena branca no círculo verde-floresta + "CURSOS / DUO" (o "DUO" em verde), como no perfil da marca.
export function BrandLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const circle = size === "sm" ? 32 : 44, feather = Math.round(circle * 0.62);
  return <span className="brand-logo" role="img" aria-label="Cursos DUO" style={{ fontSize: size === "sm" ? 14 : 18 }}>
    <span className="brand-mark" style={{ width: circle, height: circle }}><Image src="/brand/pena-branca.png" width={feather} height={feather} alt="" priority /></span>
    <span className="brand-words" aria-hidden="true"><small>CURSOS</small><strong>DUO</strong></span>
  </span>;
}
