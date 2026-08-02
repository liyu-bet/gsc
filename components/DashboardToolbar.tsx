'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { searchTypeLabel } from '@/lib/ui-labels';
import { PERIOD_PRESETS, periodToQueryParams } from '@/lib/periods';

const METRIC_OPTIONS = [
  { key: 'clicks', label: 'Клики', icon: '✦' },
  { key: 'impressions', label: 'Показы', icon: '◉' },
  { key: 'position', label: 'Ср. позиция', icon: '⌃' },
] as const;

const SORT_OPTIONS = [
  { key: 'az', label: 'А → Я' },
  { key: 'total', label: 'Всего' },
  { key: 'growth', label: 'Рост' },
  { key: 'growthPct', label: 'Рост %' },
] as const;

const SEARCH_TYPES = [
  { key: 'web', label: searchTypeLabel('web') },
  { key: 'discover', label: searchTypeLabel('discover') },
  { key: 'news', label: searchTypeLabel('news') },
  { key: 'image', label: searchTypeLabel('image') },
  { key: 'video', label: searchTypeLabel('video') },
] as const;

const PERIOD_OPTIONS = PERIOD_PRESETS.filter((item) => item.id !== 'custom');

const STORAGE_KEY = 'gsk-dashboard-preferences';
const GLOBAL_STORAGE_KEY = 'gsk-global-preferences';

type MetricKey = (typeof METRIC_OPTIONS)[number]['key'];

function scrubLegacy(raw: Record<string, unknown>) {
  const next = { ...raw };
  delete next.startDate;
  delete next.endDate;
  delete next.customOpen;
  return next;
}

export function DashboardToolbar({
  compare,
  periodId,
  search,
  searchType,
  sort,
  visibleMetrics,
  endDate,
}: {
  compare: boolean;
  periodId: string;
  search: string;
  searchType: string;
  sort: string;
  visibleMetrics: MetricKey[];
  endDate: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    const payload = scrubLegacy({
      period: periodId,
      searchType,
      compare: compare ? '1' : '0',
      metrics: visibleMetrics.join(','),
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.setItem(
      GLOBAL_STORAGE_KEY,
      JSON.stringify({
        period: periodId,
        searchType,
      })
    );
  }, [periodId, searchType, compare, visibleMetrics]);

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    let changed = false;

    if (!params.get('period') && params.get('range') === '1') {
      params.set('period', '24h');
      params.delete('range');
      changed = true;
    }

    try {
      const dashboardRaw = window.localStorage.getItem(STORAGE_KEY);
      if (dashboardRaw) {
        const stored = scrubLegacy(JSON.parse(dashboardRaw) as Record<string, unknown>) as Record<
          string,
          string
        >;
        for (const key of ['period', 'searchType', 'compare', 'metrics'] as const) {
          if (!params.get(key) && stored[key]) {
            if (key === 'period' && params.get('range')) continue;
            const value =
              key === 'metrics'
                ? stored[key]
                    .split(',')
                    .map((item) => item.trim())
                    .filter((item) => item && item !== 'ctr')
                    .join(',')
                : stored[key];
            if (value) {
              params.set(key, value);
              changed = true;
            }
          }
        }
      }

      const globalRaw = window.localStorage.getItem(GLOBAL_STORAGE_KEY);
      if (globalRaw) {
        const storedGlobal = scrubLegacy(JSON.parse(globalRaw) as Record<string, unknown>) as Record<
          string,
          string
        >;
        for (const key of ['period', 'searchType'] as const) {
          if (!params.get(key) && !params.get('range') && storedGlobal[key]) {
            params.set(key, storedGlobal[key]);
            changed = true;
          }
        }
      }
    } catch {
      // ignore malformed local state
    }

    if (changed) {
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname);
    }
  }, [pathname, queryString, router]);

  function buildHref(nextValues: Partial<Record<string, string | undefined>>) {
    const params = new URLSearchParams(queryString);

    for (const [key, value] of Object.entries(nextValues)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const toggleMetricHref = (metric: MetricKey) => {
    const current = new Set(visibleMetrics);
    if (current.has(metric)) {
      if (current.size === 1) return buildHref({});
      current.delete(metric);
    } else {
      current.add(metric);
    }
    return buildHref({ metrics: Array.from(current).join(',') });
  };

  return (
    <section className="seo-toolbar panel panel-compact">
      <div className="toolbar-left">
        <form action="/dashboard" className="search-form" method="get">
          <input defaultValue={search} name="q" placeholder="Поиск" type="search" />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="period" value={periodId} />
          <input type="hidden" name="searchType" value={searchType} />
          <input type="hidden" name="compare" value={compare ? '1' : '0'} />
          <input type="hidden" name="metrics" value={visibleMetrics.join(',')} />
          <button className="button ghost small" type="submit">
            Найти
          </button>
        </form>
      </div>

      <div className="toolbar-right">
        <details className="toolbar-menu">
          <summary>Сортировка</summary>
          <div className="menu-card">
            {SORT_OPTIONS.map((option) => (
              <Link
                className={sort === option.key ? 'menu-item active' : 'menu-item'}
                href={buildHref({ sort: option.key })}
                key={option.key}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </details>

        <details className="toolbar-menu">
          <summary>Фильтр</summary>
          <div className="menu-card menu-card-wide">
            <div className="menu-group">
              <div className="menu-label">Тип поиска</div>
              {SEARCH_TYPES.map((option) => (
                <Link
                  className={searchType === option.key ? 'menu-item active' : 'menu-item'}
                  href={buildHref({ searchType: option.key })}
                  key={option.key}
                >
                  {option.label}
                </Link>
              ))}
            </div>
            <div className="menu-group">
              <div className="menu-label">Сравнение</div>
              <Link className={compare ? 'menu-item active' : 'menu-item'} href={buildHref({ compare: '1' })}>
                С предыдущим периодом
              </Link>
              <Link className={!compare ? 'menu-item active' : 'menu-item'} href={buildHref({ compare: '0' })}>
                Выключено
              </Link>
            </div>
          </div>
        </details>

        <div className="metric-switches" aria-label="Переключение метрик">
          {METRIC_OPTIONS.map((metric) => (
            <Link
              className={visibleMetrics.includes(metric.key) ? 'metric-chip active' : 'metric-chip'}
              href={toggleMetricHref(metric.key as MetricKey)}
              key={metric.key}
              title={metric.label}
            >
              <span>{metric.icon}</span>
            </Link>
          ))}
        </div>

        <div className="site-control-group dashboard-range-group">
          <label htmlFor="dashboard-period">Период</label>
          <select
            id="dashboard-period"
            className="site-control-select"
            value={periodId}
            onChange={(event) => {
              const nextId = event.target.value;
              const resolved =
                nextId === '24h'
                  ? ({ id: '24h', mode: 'hourly', compareDefault: false } as const)
                  : ({ id: nextId, mode: 'daily', days: 28, compareDefault: true } as const);
              const periodParams = periodToQueryParams(resolved);
              router.push(
                buildHref({
                  period: periodParams.period,
                  range: undefined,
                  startDate: undefined,
                  endDate: undefined,
                })
              );
            }}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {periodId !== '24h' ? (
            <span className="toolbar-last-date">Последняя доступная дата: {endDate}</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
