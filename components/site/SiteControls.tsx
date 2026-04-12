'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const RANGE_OPTIONS = [7, 14, 28, 90, 180, 365, 730];
const SEARCH_TYPES = ['web', 'discover', 'news', 'image', 'video'] as const;
const STORAGE_KEY = 'gsk-site-workspace-preferences';
const GLOBAL_STORAGE_KEY = 'gsk-global-preferences';

export function SiteControls({
  currentRange,
  currentSearchType,
  currentEndDate,
}: {
  currentRange: number;
  currentSearchType: string;
  currentEndDate: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    const payload = {
      range: String(currentRange),
      searchType: currentSearchType,
      endDate: currentEndDate,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.setItem(
      GLOBAL_STORAGE_KEY,
      JSON.stringify({
        range: String(currentRange),
        searchType: currentSearchType,
      })
    );
  }, [currentRange, currentSearchType, currentEndDate]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const stored = JSON.parse(raw) as Record<string, string>;
      const params = new URLSearchParams(queryString);
      let changed = false;

      for (const key of ['range', 'searchType', 'endDate'] as const) {
        if (!params.get(key) && stored[key]) {
          params.set(key, stored[key]);
          changed = true;
        }
      }

      if (changed) {
        const next = params.toString();
        router.replace(next ? `${pathname}?${next}` : pathname);
      }
    } catch {
      // ignore broken storage
    }
  }, [pathname, queryString, router]);

  function updateParam(name: string, value: string) {
    const params = new URLSearchParams(queryString);
    params.set(name, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="site-controls">
      <div className="site-control-group">
        <label htmlFor="site-end-date">End date</label>
        <input
          id="site-end-date"
          className="site-control-select"
          type="date"
          value={currentEndDate}
          onChange={(event) => updateParam('endDate', event.target.value)}
        />
      </div>

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