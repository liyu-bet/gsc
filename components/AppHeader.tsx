import { ConnectedAccountsControl } from '@/components/ConnectedAccountsControl';

type ConnectionItem = {
  id: string;
  email: string;
  name: string | null;
  propertiesCount: number;
};

type AppHeaderProps = {
  compact?: boolean;
  connections?: ConnectionItem[];
};

export function AppHeader({ compact = false, connections = [] }: AppHeaderProps) {
  return (
    <header className={compact ? 'app-header app-header-compact' : 'app-header'}>
      <div>
        <div className="badge">Портфельная панель</div>
        <h1>{compact ? 'Портфель SEO-метрик' : 'Рабочее пространство Google Search Console'}</h1>
        <p className="muted">
          Подключайте несколько аккаунтов Google, выбирайте ресурсы и следите за показателями всего
          портфеля в одном месте.
        </p>
      </div>
      <div className="header-actions">
        <a className="button" href="/api/google/connect">
          Подключить аккаунт Google
        </a>
        <ConnectedAccountsControl connections={connections} />
        <form action="/api/auth/logout" method="post">
          <button className="button ghost" type="submit">
            Выйти
          </button>
        </form>
      </div>
    </header>
  );
}
