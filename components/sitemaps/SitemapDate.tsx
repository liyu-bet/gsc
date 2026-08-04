'use client';

import { formatSitemapDate } from '@/lib/sitemap-view';

export function SitemapDate({
  value,
  timeZone,
}: {
  value: string | null | undefined;
  /** Optional — tests only. Browser uses local timezone when omitted. */
  timeZone?: string;
}) {
  const label = formatSitemapDate(value, timeZone);
  if (!value || label === '—') {
    return <span>—</span>;
  }
  return <span title={value}>{label}</span>;
}
