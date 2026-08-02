'use client';

type ConnectionItem = {
  id: string;
  email: string;
  name: string | null;
  propertiesCount: number;
};

export function ConnectedAccountsControl({ connections }: { connections: ConnectionItem[] }) {
  const summary =
    connections.length === 0
      ? 'Аккаунты не подключены'
      : connections.length === 1
        ? connections[0].email
        : `Аккаунты · ${connections.length}`;

  return (
    <div className="accounts-control">
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
                    <span className="muted small-text">
                      Ресурсов: {connection.propertiesCount}
                    </span>
                  </div>
                  <div className="accounts-list-actions">
                    <form action={`/api/connections/${connection.id}/sync`} method="post">
                      <button className="button ghost small" type="submit">
                        Обновить
                      </button>
                    </form>
                    <form action={`/api/connections/${connection.id}/delete`} method="post">
                      <button className="button ghost small" type="submit">
                        Удалить
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <form action="/api/connections/sync-all" method="post">
        <button
          className="button small"
          type="submit"
          disabled={connections.length === 0}
          title="Обновить сайты во всех подключённых аккаунтах"
        >
          Обновить все
        </button>
      </form>
    </div>
  );
}
