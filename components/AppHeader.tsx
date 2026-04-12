type AppHeaderProps = {
  compact?: boolean;
};

export function AppHeader({ compact = false }: AppHeaderProps) {
  return (
    <header className={compact ? 'app-header app-header-compact' : 'app-header'}>
      <div>
        <div className="badge">Portfolio dashboard</div>
        <h1>{compact ? 'SEO-style portfolio view' : 'Google Search Console workspace'}</h1>
        <p className="muted">
          Connect multiple Google accounts, select properties, and monitor portfolio performance in one
          place.
        </p>
      </div>
      <div className="header-actions">
        <a className="button" href="/api/google/connect">
          Connect Google account
        </a>
        <form action="/api/auth/logout" method="post">
          <button className="button ghost" type="submit">
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
