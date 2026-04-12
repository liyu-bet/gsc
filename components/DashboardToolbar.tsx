import Link from 'next/link';

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

const RANGE_OPTIONS = [
  { key: '7', label: '7 days' },
  { key: '14', label: '14 days' },
  { key: '28', label: '28 days' },
  { key: '90', label: '3 months' },
  { key: '180', label: '6 months' },
  { key: '365', label: '12 months' },
] as const;

const SEARCH_TYPES = [
  { key: 'web', label: 'Web' },
  { key: 'discover', label: 'Discover' },
  { key: 'news', label: 'News' },
  { key: 'image', label: 'Image' },
  { key: 'video', label: 'Video' },
] as const;

type MetricKey = 'clicks' | 'impressions' | 'ctr' | 'position';

type DashboardToolbarProps = {
  search: string;
  sort: string;
  range: number;
  searchType: string;
  compare: boolean;
  visibleMetrics: MetricKey[];
};

export function DashboardToolbar({
  search,
  sort,
  range,
  searchType,
  compare,
  visibleMetrics,
}: DashboardToolbarProps) {
  const buildHref = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (sort) params.set('sort', sort);
    if (range) params.set('range', String(range));
    if (searchType) params.set('searchType', searchType);
    if (compare) params.set('compare', '1');
    if (visibleMetrics.length) params.set('metrics', visibleMetrics.join(','));

    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const query = params.toString();
    return query ? `/dashboard?${query}` : '/dashboard';
  };

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
        <button className="button ghost small muted-button" disabled type="button">
          Create Portfolio View
        </button>
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

        <details className="toolbar-menu">
          <summary>{RANGE_OPTIONS.find((option) => option.key === String(range))?.label || `${range} days`}</summary>
          <div className="menu-card">
            {RANGE_OPTIONS.map((option) => (
              <Link
                className={range === Number(option.key) ? 'menu-item active' : 'menu-item'}
                href={buildHref({ range: option.key })}
                key={option.key}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
