import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) {
    redirect('/dashboard');
  }

  const params = (await searchParams) || {};

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="badge">Self-hosted</div>
        <h1>{env.appName}</h1>
        <p className="muted">
          One admin login for your app. After that, connect one or more Google Search Console accounts
          inside the dashboard.
        </p>

        {params.error ? <div className="alert error">{params.error}</div> : null}

        <form className="stack" action="/api/auth/login" method="post">
          <label className="field">
            <span>Email</span>
            <input type="email" name="email" placeholder="admin@example.com" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" name="password" placeholder="••••••••" required />
          </label>
          <button className="button primary" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
