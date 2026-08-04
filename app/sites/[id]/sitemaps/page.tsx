import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConnectionStatusBadge } from '@/components/ConnectionStatusBadge';
import { GoogleScopeBadge } from '@/components/GoogleScopeBadge';
import { SitemapList } from '@/components/sitemaps/SitemapList';
import { SitemapSubmitForm } from '@/components/sitemaps/SitemapSubmitForm';
import { requireAdmin } from '@/lib/auth';
import { isBlockedConnectionStatus } from '@/lib/connection-status';
import { GoogleApiError } from '@/lib/google-errors';
import { listSitemaps } from '@/lib/google-sitemaps';
import { getGoogleScopeCapabilities } from '@/lib/google-scopes';
import { prisma } from '@/lib/prisma';
import { sortSitemapViewModels, toSitemapViewModel } from '@/lib/sitemap-view';
import { validateSitemapIndexUrl } from '@/lib/sitemap-validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ sitemapIndex?: string; notice?: string }>;
};

export default async function PropertySitemapsPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const query = (await searchParams) || {};

  const property = await prisma.gscProperty.findUnique({
    where: { id },
    select: {
      id: true,
      siteUrl: true,
      label: true,
      permissionLevel: true,
      connectionId: true,
      connection: {
        select: {
          id: true,
          email: true,
          status: true,
          scope: true,
          lastErrorMessage: true,
          lastSuccessAt: true,
        },
      },
    },
  });

  if (!property) notFound();

  const connection = property.connection;
  const capabilities = getGoogleScopeCapabilities(connection.scope);
  const blocked = isBlockedConnectionStatus(connection.status);
  const isDomainProperty = property.siteUrl.toLowerCase().startsWith('sc-domain:');
  const canManage = capabilities.canManageSitemaps;
  const canList =
    connection.status === 'ACTIVE' && !blocked;

  let listError: string | null = null;
  let rows = sortSitemapViewModels([]);
  let activeSitemapIndex: string | null = null;

  if (query.sitemapIndex) {
    const validated = validateSitemapIndexUrl(property.siteUrl, query.sitemapIndex);
    if (!validated.ok) {
      listError = validated.message;
    } else {
      activeSitemapIndex = validated.sitemapUrl;
    }
  }

  if (canList && !listError) {
    try {
      const resources = await listSitemaps(connection.id, property.siteUrl, {
        sitemapIndex: activeSitemapIndex || undefined,
      });
      rows = sortSitemapViewModels(resources.map((item) => toSitemapViewModel(item)));
    } catch (error) {
      listError =
        error instanceof GoogleApiError
          ? error.safeMessage
          : 'Не удалось загрузить список карт сайта';
    }
  }

  let submitDisabledReason: string | null = null;
  if (blocked) {
    submitDisabledReason = 'Переподключите аккаунт Google, чтобы управлять картами сайта';
  } else if (connection.status === 'ERROR') {
    submitDisabledReason = connection.lastErrorMessage || 'Исправьте ошибку подключения перед отправкой';
  } else if (!canManage) {
    submitDisabledReason = 'Нужен полный доступ Search Console для отправки карт сайта';
  }

  return (
    <main className="page-shell site-shell">
      <section className="panel site-hero-panel">
        <div className="site-hero-head">
          <div>
            <div className="badge">Карты сайта</div>
            <h1>{property.label || property.siteUrl}</h1>
            <p className="muted">{property.siteUrl}</p>
            <p className="muted">Google: {connection.email}</p>
            {property.permissionLevel ? (
              <p className="muted">Уровень доступа: {property.permissionLevel}</p>
            ) : null}
          </div>
          <div className="header-actions">
            <Link className="button ghost small" href={`/sites/${property.id}`}>
              Назад к аналитике сайта
            </Link>
            <Link className="button ghost small" href="/dashboard">
              Назад к dashboard
            </Link>
          </div>
        </div>

        <div className="sitemap-meta-row">
          <ConnectionStatusBadge
            status={connection.status}
            lastSuccessAt={connection.lastSuccessAt?.toISOString() ?? null}
            lastErrorMessage={connection.lastErrorMessage}
          />
          <GoogleScopeBadge
            connectionId={connection.id}
            allowUpgrade={!blocked}
            capabilities={capabilities}
          />
        </div>
      </section>

      {blocked ? (
        <section className="panel site-detail-panel">
          <p>Доступ к аккаунту Google требует повторного входа.</p>
          <a
            className="button"
            href={`/api/google/connect?connectionId=${encodeURIComponent(connection.id)}&intent=reconnect`}
          >
            Переподключить Google
          </a>
        </section>
      ) : null}

      {connection.status === 'ERROR' && !blocked ? (
        <section className="panel site-detail-panel">
          <p>{connection.lastErrorMessage || 'Временная ошибка подключения Google'}</p>
          <div className="header-actions">
            <form action={`/api/connections/${connection.id}/retry`} method="post">
              <button className="button" type="submit">
                Повторить
              </button>
            </form>
            <a
              className="button ghost"
              href={`/api/google/connect?connectionId=${encodeURIComponent(connection.id)}&intent=reconnect`}
            >
              Переподключить
            </a>
          </div>
        </section>
      ) : null}

      <section className="panel site-detail-panel">
        <div className="mini-tabs">
          <h3>Список карт сайта</h3>
        </div>

        {activeSitemapIndex ? (
          <p className="sitemap-breadcrumb">
            Индекс:{' '}
            <code title={activeSitemapIndex}>{activeSitemapIndex}</code>
            {' · '}
            <Link href={`/sites/${property.id}/sitemaps`}>К основному списку</Link>
          </p>
        ) : null}

        {listError ? (
          <p className="sitemap-notice-error" role="alert">
            {listError}
          </p>
        ) : null}

        {canList && !listError ? (
          <SitemapList propertyId={property.id} rows={rows} />
        ) : null}

        {!canList && connection.status === 'ERROR' ? (
          <p className="muted">Список карт сайта будет доступен после успешного retry.</p>
        ) : null}
      </section>

      <section className="panel site-detail-panel">
        <div className="mini-tabs">
          <h3>Отправить карту сайта</h3>
        </div>
        {!canManage && !blocked ? (
          <p className="muted">
            Список доступен при readonly-доступе. Для отправки расширьте разрешения Google.
          </p>
        ) : null}
        <SitemapSubmitForm
          propertyId={property.id}
          siteUrl={property.siteUrl}
          isDomainProperty={isDomainProperty}
          canSubmit={connection.status === 'ACTIVE' && canManage}
          disabledReason={submitDisabledReason}
        />
      </section>
    </main>
  );
}
