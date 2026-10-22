import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

// Contato para pedidos de exclusão: pendente de confirmação com o Cursos DUO (spec §12).
const CONTACT = "[e-mail de contato a confirmar com o DUO]";

export default function PrivacyPage() {
  return <main className="content prose">
    <BrandLogo />
    <h1>Privacidade</h1>
    <p>Este app é oferecido pelo <strong>Cursos DUO</strong> aos alunos do curso Reta Final DPE-SP. O Cursos DUO é o controlador dos dados.</p>
    <h2>O que guardamos</h2>
    <ul><li>Seu e-mail e nome, para liberar o acesso.</li><li>Seus grifos, anotações e marcações de revisão.</li><li>A última seção lida em cada disciplina, para você continuar de onde parou.</li></ul>
    <h2>Para quê</h2>
    <p>Somente para o seu estudo dentro do curso. Ninguém além de você vê seus grifos e anotações. A equipe vê apenas quem tem acesso ao app.</p>
    <h2>Exclusão</h2>
    <p>Para pedir a exclusão dos seus dados, escreva para {CONTACT}.</p>
    <p><Link href="/login">Voltar</Link></p>
  </main>;
}
