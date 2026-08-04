'use client';

import { useEffect, useState } from 'react';
import { getSitemapDateDisplayState } from '@/lib/sitemap-date-display';

export function SitemapDate({
  value,
  timeZone,
}: {
  value: string | null | undefined;
  /** Optional — tests / forced zone. Browser local zone when omitted after mount. */
  timeZone?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const display = getSitemapDateDisplayState({
    value,
    mounted,
    timeZone,
  });

  return (
    <span
      title={display.title ?? undefined}
      aria-label={
        display.ready
          ? display.text === '—'
            ? 'Дата недоступна'
            : `Дата: ${display.text}`
          : 'Дата загружается'
      }
    >
      {display.text}
    </span>
  );
}
