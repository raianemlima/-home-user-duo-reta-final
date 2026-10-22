"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";

const PLAIN = ["/login", "/configuracao", "/privacidade"];

export function AppShell({ children, isStaff }: { children: React.ReactNode; isStaff: boolean }) {
  const pathname = usePathname(); const router = useRouter();
  if (PLAIN.includes(pathname)) return <>{children}</>;
  const navigation = [
    { href: "/", label: "Disciplinas", icon: "▤", active: pathname === "/" || pathname.startsWith("/disciplinas") },
    { href: "/caderno", label: "Caderno", icon: "✎", active: pathname.startsWith("/caderno") },
    ...(isStaff ? [{ href: "/equipe", label: "Equipe", icon: "⚙", active: pathname.startsWith("/equipe") }] : []),
  ];
  async function signOut() { await createClient().auth.signOut(); router.replace("/login"); router.refresh(); }
  const links = navigation.map((item) => <Link className={item.active ? "nav-link active" : "nav-link"} href={item.href} key={item.href} aria-current={item.active ? "page" : undefined}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>);
  return <div className="app-shell">
    <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <aside className="sidebar"><Link href="/" aria-label="Início"><BrandLogo /></Link><p className="eyebrow">Reta Final DPE-SP</p><nav className="main-nav" aria-label="Navegação principal">{links}</nav><div className="sidebar-footer"><ThemeToggle /><button className="button ghost" onClick={signOut}>Sair</button></div></aside>
    <div className="main-column">
      <header className="mobile-top"><Link href="/" aria-label="Início"><BrandLogo size="sm" /></Link><span><ThemeToggle /><button className="icon-button" onClick={signOut} aria-label="Sair">⎋</button></span></header>
      <main className="content" id="conteudo">{children}</main>
      <nav className="bottom-nav" aria-label="Navegação principal">{links}</nav>
    </div>
  </div>;
}
