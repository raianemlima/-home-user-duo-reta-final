// Aparece na hora em que o aluno toca num link, enquanto a página carrega: a navegação responde ao toque.
export default function Loading() {
  return <div className="page-loading" role="status" aria-live="polite">
    <span className="visually-hidden">Carregando…</span>
    <span className="skeleton skeleton-eyebrow" /><span className="skeleton skeleton-title" />
    <span className="skeleton skeleton-card" /><span className="skeleton skeleton-card" /><span className="skeleton skeleton-card short" />
  </div>;
}
