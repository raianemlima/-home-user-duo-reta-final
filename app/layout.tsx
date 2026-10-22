import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// Endereço público do app: deixa links, ícones e prévias compartilhadas resolverem no domínio dos alunos,
// em vez de caminhos relativos. NEXT_PUBLIC_SITE_URL sobrescreve quando o domínio mudar.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://duo-reta-final.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Cursos DUO · Reta Final DPE-SP",
  description: "Leia o material do curso, grife e monte seu caderno de revisão.",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "DUO Reta Final", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#17401F", width: "device-width", initialScale: 1 };

// Aplica tema e tamanho de letra salvos antes da pintura (evita piscar).
const PREFERENCES = `try{var t=localStorage.getItem("duo-tema");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;var f=localStorage.getItem("duo-fonte");if(f)document.documentElement.dataset.font=f}catch(e){}`;

async function staffFlag(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return false;
    const { data: profile } = await supabase.from("profiles").select("role, active").eq("user_id", data.user.id).maybeSingle();
    return profile?.role === "equipe" && profile.active === true;
  } catch { return false; }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: PREFERENCES }} /></head>
      <body>
        <AppShell isStaff={await staffFlag()}>{children}</AppShell>
      </body>
    </html>
  );
}
