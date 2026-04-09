export function AppHeader() {
  return (
    <header className="app-header">
      <div>
        <div className="badge">Portfolio dashboard</div>
        <h1>Google Search Console workspace</h1>
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
