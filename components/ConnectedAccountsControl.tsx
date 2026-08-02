'use client';

type ConnectionItem = {
  id: string;
  email: string;
  name: string | null;
  propertiesCount: number;
};

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.1-5.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function ConnectedAccountsControl({ connections }: { connections: ConnectionItem[] }) {
  const summary =
    connections.length === 0
      ? 'Аккаунты не подключены'
      : connections.length === 1
        ? connections[0].email
        : `Аккаунты · ${connections.length}`;

  return (
    <div className="accounts-control">
      <div className="accounts-combo">
        <details className="accounts-select">
          <summary className="accounts-select-summary" title="Подключённые аккаунты Google">
            <span className="accounts-select-label">{summary}</span>
            <span className="accounts-select-caret" aria-hidden="true">
              ▾
            </span>
          </summary>

          <div className="accounts-select-menu">
            {connections.length === 0 ? (
              <div className="accounts-empty muted">
                Пока нет подключений. Нажмите «Подключить аккаунт Google».
              </div>
            ) : (
              <ul className="accounts-list">
                {connections.map((connection) => (
                  <li key={connection.id} className="accounts-list-item">
                    <div className="accounts-list-meta">
                      <strong>{connection.name || connection.email}</strong>
                      {connection.name ? <span className="muted">{connection.email}</span> : null}
                      <span className="muted small-text">Ресурсов: {connection.propertiesCount}</span>
                    </div>
                    <div className="accounts-list-actions">
                      <form action={`/api/connections/${connection.id}/sync`} method="post">
                        <button
                          className="accounts-icon-btn"
                          type="submit"
                          title="Обновить сайты"
                          aria-label={`Обновить ${connection.email}`}
                        >
                          <RefreshIcon />
                        </button>
                      </form>
                      <form action={`/api/connections/${connection.id}/delete`} method="post">
                        <button
                          className="accounts-icon-btn accounts-icon-btn-danger"
                          type="submit"
                          title="Удалить аккаунт"
                          aria-label={`Удалить ${connection.email}`}
                        >
                          <TrashIcon />
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>

        <div className="accounts-combo-divider" aria-hidden="true" />

        <form action="/api/connections/sync-all" method="post" className="accounts-sync-all-form">
          <button
            className="accounts-icon-btn accounts-sync-all-btn"
            type="submit"
            disabled={connections.length === 0}
            title="Обновить все аккаунты"
            aria-label="Обновить все аккаунты"
          >
            <RefreshIcon />
          </button>
        </form>
      </div>
    </div>
  );
}
