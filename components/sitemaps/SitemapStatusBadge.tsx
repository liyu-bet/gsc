'use client';

import type { SitemapUiStatus } from '@/lib/sitemap-view';

const LABELS: Record<SitemapUiStatus, string> = {
  pending: 'Обработка',
  error: 'Ошибки',
  warning: 'Предупреждения',
  success: 'Успешно',
};

export function SitemapStatusBadge({
  status,
  label,
}: {
  status: SitemapUiStatus;
  label?: string;
}) {
  const text = label || LABELS[status];
  return (
    <span
      className={`sitemap-status-badge sitemap-status-${status}`}
      aria-label={`Статус карты сайта: ${text}`}
    >
      <span className="sitemap-status-dot" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
