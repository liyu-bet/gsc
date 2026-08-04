import Link from 'next/link';
import { BulkSitemapClient, type BulkPropertyRow } from '@/components/sitemaps/BulkSitemapClient';
import { requireAdmin } from '@/lib/auth';
import { isBlockedConnectionStatus } from '@/lib/connection-status';
import { getGoogleScopeCapabilities } from '@/lib/google-scopes';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function ineligibleReason(input: {
  isSelected: boolean;
  status: string;
  canManageSitemaps: boolean;
}): string | null {
  if (!input.isSelected) return 'Property не выбрана';
  if (input.status === 'REVOKED' || input.status === 'REAUTH_REQUIRED') {
    return 'Требуется reconnect';
  }
  if (input.status === 'ERROR') return 'Временная ошибка connection';
  if (!input.canManageSitemaps) return 'Readonly/unknown scope';
  if (input.status !== 'ACTIVE') return 'Connection недоступен';
  return null;
}

export default async function BulkSitemapsPage() {
  await requireAdmin();

  const properties = await prisma.gscProperty.findMany({
    where: { isSelected: true },
    select: {
      id: true,
      siteUrl: true,
      label: true,
      permissionLevel: true,
      isSelected: true,
      connection: {
        select: {
          id: true,
          email: true,
          status: true,
          scope: true,
        },
      },
    },
    orderBy: [{ connection: { email: 'asc' } }, { siteUrl: 'asc' }],
  });

  const rows: BulkPropertyRow[] = properties.map((property) => {
    const caps = getGoogleScopeCapabilities(property.connection.scope);
    const reason = ineligibleReason({
      isSelected: property.isSelected,
      status: property.connection.status,
      canManageSitemaps: caps.canManageSitemaps,
    });
    const eligible =
      property.isSelected &&
      property.connection.status === 'ACTIVE' &&
      !isBlockedConnectionStatus(property.connection.status) &&
      caps.canManageSitemaps;

    return {
      id: property.id,
      siteUrl: property.siteUrl,
      label: property.label,
      permissionLevel: property.permissionLevel,
      accountEmail: property.connection.email,
      eligible,
      ineligibleReason: eligible ? null : reason,
    };
  });

  return (
    <main className="page-shell">
      <section className="panel site-hero-panel">
        <div className="site-hero-head">
          <div>
            <div className="badge">Массовая отправка</div>
            <h1>Карты сайта</h1>
            <p className="muted">
              Отправка одного относительного пути для выбранных ресурсов. Список sitemap у Google
              при загрузке страницы не запрашивается.
            </p>
          </div>
          <div className="header-actions">
            <Link className="button ghost small" href="/dashboard">
              Назад к dashboard
            </Link>
          </div>
        </div>
      </section>

      <BulkSitemapClient properties={rows} />
    </main>
  );
}
