import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { defaultDateRange, querySite } from '@/lib/google';
import { formatDecimal, formatNumber, formatPercent } from '@/lib/format';
import { DashboardToolbar } from '@/components/DashboardToolbar';
import { PortfolioCard } from '@/components/PortfolioCard';
import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';

type MetricKey = 'clicks' | 'impressions' | 'ctr' | 'position';
type SearchType = 'web' | 'discover' | 'news' | 'image' | 'video';

type DailyRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SiteCardData = {
  id: string;
  label: string;
  siteUrl: string;
  connectionId: string;
  connectionEmail: string;
  currentSeries: Record<MetricKey, number[]>;
  previousSeries: Record<MetricKey, number[]>;
  metrics: Record<MetricKey, { current: number; previous: number; delta: number; deltaPct: number }>;
  error: string | null;
};

const DEFAULT_METRICS: MetricKey[] = ['clicks', 'impressions', 'ctr', 'position'];
const VALID_METRICS = new Set<MetricKey>(DEFAULT_METRICS);
const VALID_SEARCH_TYPES = new Set<SearchType>(['web', 'discover', 'news', 'image', 'video']);
const VALID_SORTS = new Set(['az', 'total', 'growth', 'growthPct']);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{
    google_error?: string;
    q?: string;
    sort?: string;
    range?: string;
    metrics?: string;
    searchType?: string;
    compare?: string;
  }>;
}) {
  await requireAdmin();

  const params = (await searchParams) || {};
  const search = (params.q || '').trim().toLowerCase();
  const sort = VALID_SORTS.has(params.sort || '') ? (params.sort as 'az' | 'total' | 'growth' | 'growthPct') : 'total';
  const rangeDays = clampRange(params.range);
  const searchType = VALID_SEARCH_TYPES.has((params.searchType || 'web') as SearchType)
    ? ((params.searchType || 'web') as SearchType)
    : 'web';
  const compare = params.compare !== '0';
  const visibleMetrics = parseVisibleMetrics(params.metrics);

  const connections = await prisma.googleConnection.findMany({
    include: {
      properties: {
        orderBy: { siteUrl: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const selectedProperties = connections.flatMap((connection) =>
    connection.properties
      .filter((property) => property.isSelected)
      .map((property) => ({
        id: property.id,
        label: property.label || property.siteUrl,
        siteUrl: property.siteUrl,
        connectionId: connection.id,
        connectionEmail: connection.email,
      }))
  );

  const filteredProperties = selectedProperties.filter((property) => {
    if (!search) return true;
    return (
      property.label.toLowerCase().includes(search) ||
      property.siteUrl.toLowerCase().includes(search) ||
      property.connectionEmail.toLowerCase().includes(search)
    );
  });

  const range = defaultDateRange(rangeDays);
  const alignedDatesCurrent = enumerateDates(range.startDate, range.endDate);
  const alignedDatesPrevious = enumerateDates(range.previousStartDate, range.previousEndDate);

  const siteCards = await Promise.all(
    filteredProperties.map(async (property): Promise<SiteCardData> => {
      try {
        const requestBase = {
          dataState: 'all',
          dimensions: ['date'],
          rowLimit: rangeDays + 5,
          ...(searchType !== 'web' ? { type: searchType } : {}),
        };

        const [current, previous] = await Promise.all([
          querySite(property.connectionId, property.siteUrl, {
            startDate: range.startDate,
            endDate: range.endDate,
            ...requestBase,
          }),
          querySite(property.connectionId, property.siteUrl, {
            startDate: range.previousStartDate,
            endDate: range.previousEndDate,
            ...requestBase,
          }),
        ]);

        const currentRows = alignDailyRows(alignedDatesCurrent, current.rows || []);
        const previousRows = alignDailyRows(alignedDatesPrevious, previous.rows || []);

        return {
          ...property,
          currentSeries: buildSeries(currentRows),
          previousSeries: buildSeries(previousRows),
          metrics: buildMetricSnapshots(currentRows, previousRows),
          error: null,
        };
      } catch (error) {
        return {
          ...property,
          currentSeries: emptySeries(alignedDatesCurrent.length),
          previousSeries: emptySeries(alignedDatesPrevious.length),
          metrics: emptyMetrics(),
          error: error instanceof Error ? error.message : 'Unknown API error',
        };
      }
    })
  );

  const sortedSites = [...siteCards].sort((left, right) => compareSites(left, right, sort, visibleMetrics[0] || 'clicks'));

  const portfolioSummary = buildPortfolioSummary(siteCards);

  return (
    <main className="page-shell seo-shell">
      <AppHeader compact />

      {params.google_error ? <div className="alert error">Google connection error: {params.google_error}</div> : null}

      <DashboardToolbar
        compare={compare}
        range={rangeDays}
        search={search}
        searchType={searchType}
        sort={sort}
        visibleMetrics={visibleMetrics}
      />

      <section className="portfolio-summary-strip panel panel-compact">
        <div>
          <strong>{formatNumber(portfolioSummary.clicks.current)}</strong>
          <span className={portfolioSummary.clicks.deltaPct >= 0 ? 'good' : 'bad'}>
            {formatSignedPercent(portfolioSummary.clicks.deltaPct)} clicks
          </span>
        </div>
        <div>
          <strong>{compactNumber(portfolioSummary.impressions.current)}</strong>
          <span className={portfolioSummary.impressions.deltaPct >= 0 ? 'good' : 'bad'}>
            {formatSignedPercent(portfolioSummary.impressions.deltaPct)} impressions
          </span>
        </div>
        <div>
          <strong>{formatPercent(portfolioSummary.ctr.current)}</strong>
          <span className={portfolioSummary.ctr.delta >= 0 ? 'good' : 'bad'}>
            {formatSignedDecimal(portfolioSummary.ctr.delta, 2)} CTR
          </span>
        </div>
        <div>
          <strong>{formatDecimal(portfolioSummary.position.current, 1)}</strong>
          <span className={portfolioSummary.position.delta <= 0 ? 'good' : 'bad'}>
            {formatSignedDecimal(portfolioSummary.position.previous - portfolioSummary.position.current, 1)} position
          </span>
        </div>
        <div className="small-text">{range.startDate} → {range.endDate} · Recent Search Console data can still update.</div>
      </section>

      {sortedSites.length === 0 ? (
        <section className="panel">
          <EmptyState
            title="No properties match this view"
            text="Adjust the search, range, or filters and your selected Search Console properties will appear here."
          />
        </section>
      ) : (
        <section className="portfolio-grid">
          {sortedSites.map((site) => (
            <PortfolioCard
              compare={compare}
              currentSeries={site.currentSeries}
              error={site.error}
              id={site.id}
              key={site.id}
              label={site.label}
              metrics={site.metrics}
              previousSeries={site.previousSeries}
              siteUrl={site.siteUrl}
              visibleMetrics={visibleMetrics}
            />
          ))}
        </section>
      )}

      <section className="grid two-columns manage-grid">
        <section className="panel panel-compact">
          <div className="panel-header">
            <div>
              <h3>Connected Google accounts</h3>
              <p className="muted">Refresh, remove, and manage imported properties from here.</p>
            </div>
          </div>
          {connections.length === 0 ? (
            <EmptyState
              title="No Google accounts connected yet"
              text="Click “Connect Google account”, authorize access, and your available Search Console properties will appear here."
            />
          ) : (
            <div className="stack-lg">
              {connections.map((connection) => (
                <article className="connection-card" key={connection.id}>
                  <div className="connection-header">
                    <div>
                      <h4>{connection.name || connection.email}</h4>
                      <p className="muted">{connection.email}</p>
                    </div>
                    <div className="header-actions">
                      <form action={`/api/connections/${connection.id}/sync`} method="post">
                        <button className="button small" type="submit">
                          Refresh sites
                        </button>
                      </form>
                      <form action={`/api/connections/${connection.id}/delete`} method="post">
                        <button className="button ghost small" type="submit">
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel panel-compact">
          <div className="panel-header">
            <div>
              <h3>Selected properties</h3>
              <p className="muted">Only enabled properties are shown in the portfolio grid above.</p>
            </div>
          </div>
          {selectedProperties.length === 0 ? (
            <EmptyState title="No selected properties" text="Keep at least one property enabled to see it in the portfolio view." />
          ) : (
            <div className="properties-list compact-list">
              {selectedProperties.map((property) => (
                <div className="property-row" key={property.id}>
                  <div>
                    <div className="property-title">{property.label}</div>
                    <div className="muted small-text">{property.siteUrl}</div>
                  </div>
                  <div className="property-actions">
                    <a className="button ghost small" href={`/sites/${property.id}`}>
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function clampRange(value?: string) {
  const parsed = Number(value || '90');
  if (!Number.isFinite(parsed)) return 90;
  if (parsed <= 7) return 7;
  if (parsed <= 14) return 14;
  if (parsed <= 28) return 28;
  if (parsed <= 90) return 90;
  if (parsed <= 180) return 180;
  return 365;
}

function parseVisibleMetrics(value?: string): MetricKey[] {
  const parsed = (value || DEFAULT_METRICS.join(','))
    .split(',')
    .map((item) => item.trim() as MetricKey)
    .filter((item) => VALID_METRICS.has(item));

  return parsed.length ? parsed : DEFAULT_METRICS;
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const length = differenceInCalendarDays(end, start);
  return Array.from({ length: length + 1 }, (_, index) => format(addDays(start, index), 'yyyy-MM-dd'));
}

function alignDailyRows(alignedDates: string[], rows: DailyRow[]) {
  const byDate = new Map(rows.map((row) => [row.keys?.[0] || '', row]));

  return alignedDates.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      clicks: row?.clicks || 0,
      impressions: row?.impressions || 0,
      ctr: row?.ctr || 0,
      position: row?.position || 0,
    };
  });
}

function buildSeries(rows: ReturnType<typeof alignDailyRows>): Record<MetricKey, number[]> {
  return {
    clicks: rows.map((row) => row.clicks),
    impressions: rows.map((row) => row.impressions),
    ctr: rows.map((row) => row.ctr),
    position: rows.map((row) => row.position),
  };
}

function buildMetricSnapshots(currentRows: ReturnType<typeof alignDailyRows>, previousRows: ReturnType<typeof alignDailyRows>) {
  const current = summarizeRows(currentRows);
  const previous = summarizeRows(previousRows);

  return {
    clicks: metricSnapshot(current.clicks, previous.clicks),
    impressions: metricSnapshot(current.impressions, previous.impressions),
    ctr: metricSnapshot(current.ctr, previous.ctr),
    position: metricSnapshot(current.position, previous.position),
  } satisfies Record<MetricKey, { current: number; previous: number; delta: number; deltaPct: number }>;
}

function summarizeRows(rows: ReturnType<typeof alignDailyRows>) {
  const clicks = rows.reduce((acc, row) => acc + row.clicks, 0);
  const impressions = rows.reduce((acc, row) => acc + row.impressions, 0);
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const weightedPosition = impressions > 0
    ? rows.reduce((acc, row) => acc + row.position * row.impressions, 0) / impressions
    : 0;

  return {
    clicks,
    impressions,
    ctr,
    position: weightedPosition,
  };
}

function metricSnapshot(current: number, previous: number) {
  const delta = current - previous;
  const deltaPct = previous === 0 ? (current === 0 ? 0 : 100) : (delta / previous) * 100;
  return {
    current,
    previous,
    delta,
    deltaPct,
  };
}

function emptySeries(length: number): Record<MetricKey, number[]> {
  const zeros = Array.from({ length }, () => 0);
  return {
    clicks: [...zeros],
    impressions: [...zeros],
    ctr: [...zeros],
    position: [...zeros],
  };
}

function emptyMetrics() {
  return {
    clicks: metricSnapshot(0, 0),
    impressions: metricSnapshot(0, 0),
    ctr: metricSnapshot(0, 0),
    position: metricSnapshot(0, 0),
  };
}

function compareSites(left: SiteCardData, right: SiteCardData, sort: 'az' | 'total' | 'growth' | 'growthPct', primaryMetric: MetricKey) {
  if (sort === 'az') {
    return left.label.localeCompare(right.label);
  }

  const leftMetric = left.metrics[primaryMetric];
  const rightMetric = right.metrics[primaryMetric];

  if (sort === 'growthPct') {
    return rightMetric.deltaPct - leftMetric.deltaPct;
  }

  if (sort === 'growth') {
    if (primaryMetric === 'position') {
      return (rightMetric.previous - rightMetric.current) - (leftMetric.previous - leftMetric.current);
    }
    return rightMetric.delta - leftMetric.delta;
  }

  if (primaryMetric === 'position') {
    return leftMetric.current - rightMetric.current;
  }

  return rightMetric.current - leftMetric.current;
}

function buildPortfolioSummary(sites: SiteCardData[]) {
  const clicksCurrent = sites.reduce((acc, site) => acc + site.metrics.clicks.current, 0);
  const clicksPrevious = sites.reduce((acc, site) => acc + site.metrics.clicks.previous, 0);
  const impressionsCurrent = sites.reduce((acc, site) => acc + site.metrics.impressions.current, 0);
  const impressionsPrevious = sites.reduce((acc, site) => acc + site.metrics.impressions.previous, 0);
  const ctrCurrent = impressionsCurrent > 0 ? clicksCurrent / impressionsCurrent : 0;
  const ctrPrevious = impressionsPrevious > 0 ? clicksPrevious / impressionsPrevious : 0;
  const weightedPositionCurrent = impressionsCurrent > 0
    ? sites.reduce((acc, site) => acc + site.metrics.position.current * site.metrics.impressions.current, 0) / impressionsCurrent
    : 0;
  const weightedPositionPrevious = impressionsPrevious > 0
    ? sites.reduce((acc, site) => acc + site.metrics.position.previous * site.metrics.impressions.previous, 0) / impressionsPrevious
    : 0;

  return {
    clicks: metricSnapshot(clicksCurrent, clicksPrevious),
    impressions: metricSnapshot(impressionsCurrent, impressionsPrevious),
    ctr: metricSnapshot(ctrCurrent, ctrPrevious),
    position: metricSnapshot(weightedPositionCurrent, weightedPositionPrevious),
  };
}

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${formatDecimal(value / 1_000_000, 1)}M`;
  if (value >= 1_000) return `${formatDecimal(value / 1_000, 1)}k`;
  return formatNumber(value);
}

function formatSignedPercent(value: number) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatDecimal(value, 0)}%`;
}

function formatSignedDecimal(value: number, digits = 1) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatDecimal(value, digits)}`;
}
