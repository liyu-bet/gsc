import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="badge">404</div>
        <h1>Страница не найдена</h1>
        <p className="muted">Этого раздела больше нет в панели.</p>
        <Link className="button primary" href="/dashboard">
          Назад к панели
        </Link>
      </section>
    </main>
  );
}
