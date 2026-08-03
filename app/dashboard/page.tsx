import { unstable_cache } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { querySite } from '@/lib/google';
import {
  buildComparisonRange,
  enumerateDates,
  gscCalendarDate,
  type AllowedRangeDays,
} from '@/lib/date-ranges';
import { formatDecimal, formatNumber } from '@/lib/format';
import { metricDelta, summarizeMetricRows } from '@/lib/metrics';
import { parsePeriodParams } from '@/lib/periods';
import {
  buildHourlyWindowsAtAnchor,
  chooseCommonHourlyAnchor,
  findLatestAvailableHour,
  hourlyFetchDateSpan,
  normalizeHourlyRows,
  summarizeHourWindow,
  type HourlyMetricRow,
} from '@/lib/hourly-ranges';
import { buildHourlyTotalsRequest } from '@/lib/search-analytics-request';
import { DashboardToolbar } from '@/components/DashboardToolbar';
import { PortfolioCard } from '@/components/PortfolioCard';
import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';

type MetricKey = 'clicks' | 'impressions' | 'position';
type SearchType = 'web' | 'discover' | 'news' | 'image' | 'video';

type DailyRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
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
  rangeLabel: string;
};

type HourlySiteCache = {
  rows: HourlyMetricRow[];
  latestAvailableHour: string | null;
};

const DEFAULT_METRICS: MetricKey[] = ['clicks', 'impressions', 'position'];
const VALID_METRICS = new Set<MetricKey>(DEFAULT_METRICS);
const VALID_SEARCH_TYPES = new Set<SearchType>(['web', 'discover', 'news', 'image', 'video']);
const VALID_SORTS = new Set(['az', 'total', 'growth', 'growthPct']);

const getCachedDailySiteCardData = unstable_cache(
  async (
    propertyId: string,
    connectionId: string,
    siteUrl: string,
    rangeDays: AllowedRangeDays,
    searchType: SearchType,
    endDate: string
  ) => {
    const range = buildComparisonRange(rangeDays, endDate);
    const alignedDatesCurrent = enumerateDates(range.startDate, range.endDate);
    const alignedDatesPrevious = enumerateDates(range.previousStartDate, range.previousEndDate);

    const requestBase = {
      dataState: 'all',
      dimensions: ['date'],
      rowLimit: rangeDays + 5,
      ...(searchType !== 'web' ? { type: searchType } : {}),
    };

    const [current, previous] = await Promise.all([
      querySite(connectionId, siteUrl, {
        startDate: range.startDate,
        endDate: range.endDate,
        ...requestBase,
      }),
      querySite(connectionId, siteUrl, {
        startDate: range.previousStartDate,
        endDate: range.previousEndDate,
        ...requestBase,
      }),
    ]);

    const currentRows = alignDailyRows(alignedDatesCurrent, current.rows || []);
    const previousRows = alignDailyRows(alignedDatesPrevious, previous.rows || []);

    return {
      currentSeries: buildSeries(currentRows),
      previousSeries: buildSeries(previousRows),
      metrics: buildMetricSnapshots(currentRows, previousRows),
      rangeLabel: `${range.startDate} → ${range.endDate}`,
    };
  },
  ['dashboard-site-cards-daily'],
  { revalidate: 300 }
);

/** Cache raw hourly rows only — windows are built later at a shared portfolio anchor. */
const getCachedHourlyRows = unstable_cache(
  async (
    propertyId: string,
    connectionId: string,
    siteUrl: string,
    searchType: SearchType,
    dayKey: string
  ): Promise<HourlySiteCache> => {
    const span = hourlyFetchDateSpan(new Date(`${dayKey}T12:00:00.000Z`), 72);
    const body = buildHourlyTotalsRequest({
      startDate: span.startDate,
      endDate: span.endDate,
      searchType,
    });
    const response = await querySite(connectionId, siteUrl, body);
    const rows = normalizeHourlyRows(response.rows || []);
    return {
      rows,
      latestAvailableHour: findLatestAvailableHour(rows),
    };
  },
  ['dashboard-site-cards-hourly-rows-v2'],
  { revalidate: 300 }
);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{
    google_error?: string;
    q?: string;
    sort?: string;
    range?: string;
    period?: string;
    metrics?: string;
    searchType?: string;
    compare?: string;
    endDate?: string;
  }>;
}) {
  await requireAdmin();

  const params = (await searchParams) || {};
  const search = (params.q || '').trim().toLowerCase();
  const sort = VALID_SORTS.has(params.sort || '') ? (params.sort as 'az' | 'total' | 'growth' | 'growthPct') : 'total';
  const period = parsePeriodParams({ period: params.period, range: params.range });
  const searchType = VALID_SEARCH_TYPES.has((params.searchType || 'web') as SearchType)
    ? ((params.searchType || 'web') as SearchType)
    : 'web';
  const compare =
    params.compare === '1' ? true : params.compare === '0' ? false : period.compareDefault;
  const visibleMetrics = parseVisibleMetrics(params.metrics);
  const endDate = gscCalendarDate();
  const rangeDays: AllowedRangeDays = period.mode === 'daily' ? period.days : 28;
  const dailyRange = buildComparisonRange(rangeDays, endDate);

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

  let siteCards: SiteCardData[] = [];
  let summaryRangeLabel =
    period.mode === 'hourly' ? '24 часа' : `${dailyRange.startDate} → ${dailyRange.endDate}`;
  let hourlyEmptyMessage: string | null = null;

  if (period.mode === 'hourly') {
    const hourlyLoads = await Promise.all(
      filteredProperties.map(async (property) => {
        try {
          const data = await getCachedHourlyRows(
            property.id,
            property.connectionId,
            property.siteUrl,
            searchType,
            endDate
          );
          if (!data.latestAvailableHour || !data.rows.length) {
            return {
              property,
              rows: [] as HourlyMetricRow[],
              latestAvailableHour: null as string | null,
              error: 'Нет почасовых данных Search Analytics для этого ресурса',
            };
          }
          return {
            property,
            rows: data.rows,
            latestAvailableHour: data.latestAvailableHour,
            error: null as string | null,
          };
        } catch (error) {
          return {
            property,
            rows: [] as HourlyMetricRow[],
            latestAvailableHour: null as string | null,
            error: error instanceof Error ? error.message : 'Неизвестная ошибка API',
          };
        }
      })
    );

    const commonAnchor = chooseCommonHourlyAnchor(
      hourlyLoads.filter((item) => !item.error).map((item) => item.latestAvailableHour)
    );

    if (!commonAnchor) {
      hourlyEmptyMessage =
        filteredProperties.length === 0
          ? null
          : 'Нет почасовых данных ни по одному выбранному ресурсу за последние 24 часа.';
      siteCards = hourlyLoads.map((item) => ({
        ...item.property,
        currentSeries: emptySeries(24),
        previousSeries: emptySeries(24),
        metrics: emptyMetrics(),
        rangeLabel: '24 часа',
        error: item.error || 'Нет почасовых данных',
      }));
    } else {
      const windowsAtAnchor = buildHourlyWindowsAtAnchor([], commonAnchor, 24);
      summaryRangeLabel =
        windowsAtAnchor.current.start && windowsAtAnchor.current.end
          ? `${windowsAtAnchor.current.start} → ${windowsAtAnchor.current.end}`
          : commonAnchor;

      siteCards = hourlyLoads.map((item) => {
        if (item.error || !item.latestAvailableHour) {
          return {
            ...item.property,
            currentSeries: emptySeries(24),
            previousSeries: emptySeries(24),
            metrics: emptyMetrics(),
            rangeLabel: summaryRangeLabel,
            error: item.error || 'Нет почасовых данных',
          };
        }

        const windows = buildHourlyWindowsAtAnchor(item.rows, commonAnchor, 24);
        const currentTotals = summarizeHourWindow(windows.current);
        const previousTotals = summarizeHourWindow(windows.previous);
        return {
          ...item.property,
          currentSeries: {
            clicks: windows.current.rows.map((row) => row.clicks),
            impressions: windows.current.rows.map((row) => row.impressions),
            // Empty hours use position null/0 fillers — keep sparkline empty there.
            position: windows.current.rows.map((row) =>
              row.impressions > 0 && row.position != null ? row.position : Number.NaN
            ),
          },
          previousSeries: {
            clicks: windows.previous.rows.map((row) => row.clicks),
            impressions: windows.previous.rows.map((row) => row.impressions),
            position: windows.previous.rows.map((row) =>
              row.impressions > 0 && row.position != null ? row.position : Number.NaN
            ),
          },
          metrics: {
            clicks: metricDelta(currentTotals.clicks, previousTotals.clicks),
            impressions: metricDelta(currentTotals.impressions, previousTotals.impressions),
            position: metricDelta(currentTotals.position, previousTotals.position),
          },
          rangeLabel: `${windows.current.start} → ${windows.current.end}`,
          error: null,
        };
      });
    }
  } else {
    siteCards = await Promise.all(
      filteredProperties.map(async (property): Promise<SiteCardData> => {
        try {
          const data = await getCachedDailySiteCardData(
            property.id,
            property.connectionId,
            property.siteUrl,
            rangeDays,
            searchType,
            endDate
          );
          return { ...property, ...data, error: null };
        } catch (error) {
          const length = enumerateDates(dailyRange.startDate, dailyRange.endDate).length;
          return {
            ...property,
            currentSeries: emptySeries(length),
            previousSeries: emptySeries(length),
            metrics: emptyMetrics(),
            rangeLabel: `${dailyRange.startDate} → ${dailyRange.endDate}`,
            error: error instanceof Error ? error.message : 'Неизвестная ошибка API',
          };
        }
      })
    );
  }

  const sortedSites = [...siteCards].sort((left, right) =>
    compareSites(left, right, sort, visibleMetrics[0] || 'clicks')
  );

  const portfolioSummary = buildPortfolioSummary(siteCards.filter((site) => !site.error));

  return (
    <main className="page-shell seo-shell">
      <AppHeader
        compact
        connections={connections.map((connection) => ({
          id: connection.id,
          email: connection.email,
          name: connection.name,
          propertiesCount: connection.properties.length,
        }))}
      />

      {params.google_error ? <div className="alert error">Ошибка подключения Google: {params.google_error}</div> : null}

      <DashboardToolbar
        compare={compare}
        endDate={endDate}
        periodId={period.id}
        search={search}
        searchType={searchType}
        sort={sort}
        visibleMetrics={visibleMetrics}
      />

      <section className="portfolio-summary-strip panel panel-compact">
        <div>
          <strong>{formatNumber(portfolioSummary.clicks.current)}</strong>
          {compare ? (
            <span className={portfolioSummary.clicks.deltaPct >= 0 ? 'good' : 'bad'}>
              {formatSignedPercent(portfolioSummary.clicks.deltaPct)} кликов
            </span>
          ) : (
            <span className="muted">кликов</span>
          )}
        </div>
        <div>
          <strong>{compactNumber(portfolioSummary.impressions.current)}</strong>
          {compare ? (
            <span className={portfolioSummary.impressions.deltaPct >= 0 ? 'good' : 'bad'}>
              {formatSignedPercent(portfolioSummary.impressions.deltaPct)} показов
            </span>
          ) : (
            <span className="muted">показов</span>
          )}
        </div>
        <div>
          <strong>{formatDecimal(portfolioSummary.position.current, 1)}</strong>
          {compare ? (
            <span className={portfolioSummary.position.delta <= 0 ? 'good' : 'bad'}>
              {formatSignedDecimal(portfolioSummary.position.previous - portfolioSummary.position.current, 1)} позиции
            </span>
          ) : (
            <span className="muted">ср. позиция</span>
          )}
        </div>
        <div className="small-text">
          {summaryRangeLabel}
          {period.mode !== 'hourly' ? ` · Последняя доступная дата: ${endDate}` : ''}
        </div>
      </section>

      {hourlyEmptyMessage ? (
        <section className="panel">
          <EmptyState title="Нет почасовых данных" text={hourlyEmptyMessage} />
        </section>
      ) : null}

      {sortedSites.length === 0 ? (
        <section className="panel">
          <EmptyState
            title="Нет ресурсов для этого вида"
            text="Измените поиск, период или фильтры — здесь появятся выбранные ресурсы Search Console."
          />
        </section>
      ) : !hourlyEmptyMessage ? (
        <section className="portfolio-grid">
          {sortedSites.map((site) => (
            <PortfolioCard
              compare={compare}
              connectionEmail={site.connectionEmail}
              currentSeries={site.currentSeries}
              error={site.error}
              id={site.id}
              key={site.id}
              label={site.label}
              metrics={site.metrics}
              previousSeries={site.previousSeries}
              rangeLabel={site.rangeLabel}
              siteUrl={site.siteUrl}
              visibleMetrics={visibleMetrics}
            />
          ))}
        </section>
      ) : null}

      <section className="panel panel-compact sites-scroll-panel manage-grid">
        <div className="panel-header">
          <div>
            <h3>Выбранные ресурсы</h3>
            <p className="muted">В сетке портфеля выше показываются только включённые ресурсы.</p>
          </div>
        </div>
        {selectedProperties.length === 0 ? (
          <EmptyState title="Нет выбранных ресурсов" text="Включите хотя бы один ресурс, чтобы видеть его в портфеле." />
        ) : (
          <div className="properties-list compact-list sites-scroll-list">
            {selectedProperties.map((property) => (
              <div className="property-row" key={property.id}>
                <div>
                  <div className="property-title">{property.label}</div>
                  <div className="muted small-text">{property.siteUrl}</div>
                </div>
                <div className="property-actions">
                  <a
                    className="button ghost small"
                    href={`/sites/${property.id}?period=${period.mode === 'hourly' ? '24h' : period.id}&searchType=${searchType}`}
                  >
                    Открыть
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function parseVisibleMetrics(value?: string): MetricKey[] {
  const parsed = (value || DEFAULT_METRICS.join(','))
    .split(',')
    .map((item) => item.trim() as MetricKey)
    .filter((item) => VALID_METRICS.has(item));

  return parsed.length ? parsed : DEFAULT_METRICS;
}

function alignDailyRows(alignedDates: string[], rows: DailyRow[]) {
  const byDate = new Map(rows.map((row) => [row.keys?.[0] || '', row]));

  return alignedDates.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      clicks: row?.clicks || 0,
      impressions: row?.impressions || 0,
      position: row?.position || 0,
    };
  });
}

function buildSeries(rows: ReturnType<typeof alignDailyRows>): Record<MetricKey, number[]> {
  return {
    clicks: rows.map((row) => row.clicks),
    impressions: rows.map((row) => row.impressions),
    position: rows.map((row) => row.position),
  };
}

function buildMetricSnapshots(
  currentRows: ReturnType<typeof alignDailyRows>,
  previousRows: ReturnType<typeof alignDailyRows>
) {
  const current = summarizeMetricRows(currentRows);
  const previous = summarizeMetricRows(previousRows);

  return {
    clicks: metricDelta(current.clicks, previous.clicks),
    impressions: metricDelta(current.impressions, previous.impressions),
    position: metricDelta(current.position, previous.position),
  } satisfies Record<MetricKey, { current: number; previous: number; delta: number; deltaPct: number }>;
}

function emptySeries(length: number): Record<MetricKey, number[]> {
  const zeros = Array.from({ length }, () => 0);
  return {
    clicks: [...zeros],
    impressions: [...zeros],
    position: [...zeros],
  };
}

function emptyMetrics() {
  return {
    clicks: metricDelta(0, 0),
    impressions: metricDelta(0, 0),
    position: metricDelta(0, 0),
  };
}

function compareSites(
  left: SiteCardData,
  right: SiteCardData,
  sort: 'az' | 'total' | 'growth' | 'growthPct',
  primaryMetric: MetricKey
) {
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
      return rightMetric.previous - rightMetric.current - (leftMetric.previous - leftMetric.current);
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
  const weightedPositionCurrent =
    impressionsCurrent > 0
      ? sites.reduce((acc, site) => acc + site.metrics.position.current * site.metrics.impressions.current, 0) /
        impressionsCurrent
      : 0;
  const weightedPositionPrevious =
    impressionsPrevious > 0
      ? sites.reduce(
          (acc, site) => acc + site.metrics.position.previous * site.metrics.impressions.previous,
          0
        ) / impressionsPrevious
      : 0;

  return {
    clicks: metricDelta(clicksCurrent, clicksPrevious),
    impressions: metricDelta(impressionsCurrent, impressionsPrevious),
    position: metricDelta(weightedPositionCurrent, weightedPositionPrevious),
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
