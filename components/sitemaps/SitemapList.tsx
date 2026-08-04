'use client';

import Link from 'next/link';
import type { SitemapViewModel } from '@/lib/sitemap-view';
import { SitemapDate } from './SitemapDate';
import { SitemapStatusBadge } from './SitemapStatusBadge';

export function SitemapList({
  propertyId,
  rows,
  emptyMessage = 'Карты сайта ещё не отправлялись',
}: {
  propertyId: string;
  rows: SitemapViewModel[];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <div className="sitemap-table-wrap">
      <table className="sitemap-table">
        <thead>
          <tr>
            <th scope="col">URL карты сайта</th>
            <th scope="col">Статус</th>
            <th scope="col">Тип</th>
            <th scope="col">Отправлено URL</th>
            <th scope="col">Ошибки</th>
            <th scope="col">Предупреждения</th>
            <th scope="col">Отправлена</th>
            <th scope="col">Скачана Google</th>
            <th scope="col">Индекс</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path}>
              <td className="sitemap-url-cell" title={row.path}>
                {row.path}
              </td>
              <td>
                <SitemapStatusBadge status={row.status} label={row.statusLabel} />
              </td>
              <td>{row.type}</td>
              <td>{row.submittedUrlCountLabel}</td>
              <td>{row.errorsLabel}</td>
              <td>{row.warningsLabel}</td>
              <td>
                <SitemapDate value={row.lastSubmitted} />
              </td>
              <td>
                <SitemapDate value={row.lastDownloaded} />
              </td>
              <td>
                {row.isSitemapsIndex ? (
                  <Link
                    className="button ghost small"
                    href={`/sites/${propertyId}/sitemaps?sitemapIndex=${encodeURIComponent(row.path)}`}
                  >
                    Открыть индекс
                  </Link>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
