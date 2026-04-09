import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="badge">404</div>
        <h1>Page not found</h1>
        <p className="muted">This resource does not exist in your dashboard anymore.</p>
        <Link className="button primary" href="/dashboard">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
