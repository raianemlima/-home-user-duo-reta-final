import Link from "next/link";

export default function StaffHome() {
  return <div>
    <p className="eyebrow">Equipe Cursos DUO</p>
    <h1>Painel da equipe</h1>
    <ul className="discipline-grid">
      <li><Link className="discipline-card" href="/equipe/conteudo"><span className="discipline-title">Conteúdo</span><span className="discipline-meta">Enviar ebooks, conferir a prévia e publicar novas versões.</span><span className="discipline-action">Abrir →</span></Link></li>
      <li><Link className="discipline-card" href="/equipe/alunos"><span className="discipline-title">Alunos</span><span className="discipline-meta">Cadastrar a lista de e-mails e ativar ou desativar acessos.</span><span className="discipline-action">Abrir →</span></Link></li>
      <li><Link className="discipline-card" href="/equipe/cronogramas"><span className="discipline-title">Cronogramas</span><span className="discipline-meta">Publicar os cronogramas oficiais de 4h e de 6h por dia para os alunos escolherem.</span><span className="discipline-action">Abrir →</span></Link></li>
    </ul>
  </div>;
}
