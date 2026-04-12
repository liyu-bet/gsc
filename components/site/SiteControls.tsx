'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const RANGE_OPTIONS = [7, 14, 28, 90, 180, 365, 730];
const SEARCH_TYPES = ['web', 'discover', 'news', 'image', 'video'] as const;

export function SiteControls({
  currentRange,
  currentSearchType,
}: {
  currentRange: number;
  currentSearchType: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(name, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="site-controls">
      <div className="site-control-group">
        <label htmlFor="site-range">Period</label>
        <select
          id="site-range"
          className="site-control-select"
          value={String(currentRange)}
          onChange={(event) => updateParam('range', event.target.value)}
        >
          {RANGE_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {days >= 365 ? `${Math.round(days / 365)} year${days >= 730 ? 's' : ''}` : `${days} days`}
            </option>
          ))}
        </select>
      </div>

      <div className="site-control-group">
        <label htmlFor="site-search-type">Search type</label>
        <select
          id="site-search-type"
          className="site-control-select"
          value={currentSearchType}
          onChange={(event) => updateParam('searchType', event.target.value)}
        >
          {SEARCH_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
