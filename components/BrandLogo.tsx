import Image from "next/image";

// Pena no círculo + "CURSOS / DUO". Clara (terracota) sobre fundo claro; branca sobre fundo escuro.
export function BrandLogo({ variant = "light", size = "md" }: { variant?: "light" | "dark"; size?: "sm" | "md" }) {
  const px = size === "sm" ? 32 : 44;
  return <span className="brand-logo" role="img" aria-label="Cursos DUO" style={{ fontSize: size === "sm" ? 14 : 18, color: variant === "dark" ? "var(--duo-paper)" : undefined }}>
    <Image src={variant === "dark" ? "/brand/pena-branca.png" : "/brand/pena-terracota.png"} width={px} height={px} alt="" priority />
    <span className="brand-words" aria-hidden="true"><small>CURSOS</small><strong>DUO</strong></span>
  </span>;
}
