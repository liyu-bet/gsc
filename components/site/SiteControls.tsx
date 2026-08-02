'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { rangeLabel, searchTypeLabel } from '@/lib/ui-labels';

const RANGE_OPTIONS = [1, 7, 14, 28, 90, 180, 365, 730];
const SEARCH_TYPES = ['web', 'discover', 'news', 'image', 'video'] as const;
const STORAGE_KEY = 'gsk-site-workspace-preferences';
const GLOBAL_STORAGE_KEY = 'gsk-global-preferences';

export function SiteControls({
  currentRange,
  currentSearchType,
  currentEndDate,
  currentStartDate,
  latestDate,
  isCustom,
}: {
  currentRange: number;
  currentSearchType: string;
  currentEndDate: string;
  currentStartDate?: string;
  latestDate: string;
  isCustom: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = useMemo(() => searchParams.toString(), [searchParams]);
  const [customOpen, setCustomOpen] = useState(isCustom);

  useEffect(() => {
    const payload = {
      range: String(currentRange),
      searchType: currentSearchType,
      endDate: currentEndDate,
      startDate: currentStartDate || '',
      customOpen: customOpen ? '1' : '0',
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.setItem(
      GLOBAL_STORAGE_KEY,
      JSON.stringify({
        range: String(currentRange),
        searchType: currentSearchType,
      })
    );
  }, [currentRange, currentSearchType, currentEndDate, currentStartDate, customOpen]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const stored = JSON.parse(raw) as Record<string, string>;
      const params = new URLSearchParams(queryString);
      let changed = false;

      for (const key of ['range', 'searchType', 'endDate', 'startDate'] as const) {
        if (!params.get(key) && stored[key]) {
          params.set(key, stored[key]);
          changed = true;
        }
      }

      if (changed) {
        const next = params.toString();
        router.replace(next ? `${pathname}?${next}` : pathname);
      }

      if (stored.customOpen === '1') {
        setCustomOpen(true);
      }
    } catch {
      // ignore
    }
  }, [pathname, queryString, router]);

  function updateParams(nextValues: Record<string, string | undefined>) {
    const params = new URLSearchParams(queryString);

    for (const [key, value] of Object.entries(nextValues)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="site-controls-wrap">
      <div className="site-controls">
        <div className="site-control-group">
          <label htmlFor="site-end-date">Дата окончания</label>
          <input
            id="site-end-date"
            className="site-control-select"
            type="date"
            value={currentEndDate}
            onChange={(event) => updateParams({ endDate: event.target.value })}
          />
          <span className="site-last-date-note">Последняя доступная: {latestDate}</span>
        </div>

        <div className="site-control-group">
          <label htmlFor="site-range">Период</label>
          <select
            id="site-range"
            className="site-control-select"
            value={String(currentRange)}
            onChange={(event) => {
              setCustomOpen(false);
              updateParams({
                range: event.target.value,
                startDate: undefined,
              });
            }}
          >
            {RANGE_OPTIONS.map((days) => (
              <option key={days} value={String(days)}>
                {rangeLabel(days)}
              </option>
            ))}
          </select>
        </div>

        <div className="site-control-group">
          <label htmlFor="site-search-type">Тип поиска</label>
          <select
            id="site-search-type"
            className="site-control-select"
            value={currentSearchType}
            onChange={(event) => updateParams({ searchType: event.target.value })}
          >
            {SEARCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {searchTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="site-control-group">
          <label>Свой период</label>
          <button
            type="button"
            className={`button ghost small ${customOpen ? 'active-filter-button' : ''}`}
            onClick={() => setCustomOpen((value) => !value)}
          >
            {customOpen ? 'Скрыть свой период' : 'Показать свой период'}
          </button>
        </div>
      </div>

      {customOpen ? (
        <div className="site-controls site-controls-custom">
          <div className="site-control-group">
            <label htmlFor="site-start-date">Дата начала</label>
            <input
              id="site-start-date"
              className="site-control-select"
              type="date"
              value={currentStartDate || ''}
              onChange={(event) => updateParams({ startDate: event.target.value || undefined })}
            />
          </div>

          <div className="site-control-group">
            <label>Применить</label>
            <button
              type="button"
              className="button small"
              onClick={() =>
                updateParams({
                  startDate: currentStartDate || undefined,
                  endDate: currentEndDate,
                })
              }
            >
              Применить свой период
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
