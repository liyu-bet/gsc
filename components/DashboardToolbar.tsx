'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const METRIC_OPTIONS = [
  { key: 'clicks', label: 'Clicks', icon: '✦' },
  { key: 'impressions', label: 'Impressions', icon: '◉' },
  { key: 'ctr', label: 'CTR', icon: '∕' },
  { key: 'position', label: 'Avg position', icon: '⌃' },
] as const;

const SORT_OPTIONS = [
  { key: 'az', label: 'A to Z' },
  { key: 'total', label: 'Total' },
  { key: 'growth', label: 'Growth' },
  { key: 'growthPct', label: 'Growth %' },
] as const;

const SEARCH_TYPES = [
  { key: 'web', label: 'Web' },
  { key: 'discover', label: 'Discover' },
  { key: 'news', label: 'News' },
  { key: 'image', label: 'Image' },
  { key: 'video', label: 'Video' },
] as const;

const RANGE_OPTIONS = [
  { key: '7', label: '7 days' },
  { key: '14', label: '14 days' },
  { key: '28', label: '28 days' },
  { key: '90', label: '90 days' },
  { key: '180', label: '180 days' },
  { key: '365', label: '1 year' },
  { key: '730', label: '2 years' },
] as const;

const STORAGE_KEY = 'gsk-dashboard-preferences';
const GLOBAL_STORAGE_KEY = 'gsk-global-preferences';

type MetricKey = (typeof METRIC_OPTIONS)[number]['key'];

export function DashboardToolbar({
  compare,
  range,
  search,
  searchType,
  sort,
  visibleMetrics,
  endDate,
}: {
  compare: boolean;
  range: number;
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
    const payload = {
      range: String(range),
      searchType,
      compare: compare ? '1' : '0',
      metrics: visibleMetrics.join(','),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.setItem(
      GLOBAL_STORAGE_KEY,
      JSON.stringify({
        range: String(range),
        searchType,
      })
    );
  }, [range, searchType, compare, visibleMetrics]);

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    let changed = false;

    try {
      const dashboardRaw = window.localStorage.getItem(STORAGE_KEY);
      if (dashboardRaw) {
        const stored = JSON.parse(dashboardRaw) as Record<string, string>;
        for (const key of ['range', 'searchType', 'compare', 'metrics'] as const) {
          if (!params.get(key) && stored[key]) {
            params.set(key, stored[key]);
            changed = true;
          }
        }
      }

      const globalRaw = window.localStorage.getItem(GLOBAL_STORAGE_KEY);
      if (globalRaw) {
        const storedGlobal = JSON.parse(globalRaw) as Record<string, string>;
        for (const key of ['range', 'searchType'] as const) {
          if (!params.get(key) && storedGlobal[key]) {
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

  function buildHref(nextValues: Partial<Record<string, string>>) {
    const params = new URLSearchParams(queryString);

    for (const [key, value] of Object.entries(nextValues)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
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
          <input defaultValue={search} name="q" placeholder="Search" type="search" />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="range" value={range} />
          <input type="hidden" name="searchType" value={searchType} />
          <input type="hidden" name="compare" value={compare ? '1' : '0'} />
          <input type="hidden" name="metrics" value={visibleMetrics.join(',')} />
          <button className="button ghost small" type="submit">
            Search
          </button>
        </form>
      </div>

      <div className="toolbar-right">
        <details className="toolbar-menu">
          <summary>Sort</summary>
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
          <summary>Filter</summary>
          <div className="menu-card menu-card-wide">
            <div className="menu-group">
              <div className="menu-label">Search Type</div>
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
              <div className="menu-label">Comparison</div>
              <Link className={compare ? 'menu-item active' : 'menu-item'} href={buildHref({ compare: '1' })}>
                Previous period line
              </Link>
              <Link className={!compare ? 'menu-item active' : 'menu-item'} href={buildHref({ compare: '0' })}>
                Disabled
              </Link>
            </div>
          </div>
        </details>

        <div className="metric-switches" aria-label="Metric toggles">
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
          <label htmlFor="dashboard-range">Period</label>
          <select
            id="dashboard-range"
            className="site-control-select"
            value={String(range)}
            onChange={(event) => router.push(buildHref({ range: event.target.value }))}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}