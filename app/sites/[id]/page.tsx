import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { defaultDateRange, querySite, SearchAnalyticsRow } from '@/lib/google';
import { countryName } from '@/lib/countries';
import { formatDecimal, formatNumber } from '@/lib/format';
import { SiteTrendChart } from '@/components/site/SiteTrendChart';
import { WorkspaceTable } from '@/components/site/WorkspaceTable';
import { BrandedKeywordsPanel } from '@/components/site/BrandedKeywordsPanel';
import { QueryCountingChart } from '@/components/site/QueryCountingChart';
import { SiteControls } from '@/components/site/SiteControls';

type SafeReport = {
  rows: SearchAnalyticsRow[];
  error?: string | null;
};

type EnrichedRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previousClicks: number;
  previousImpressions: number;
  previousCtr: number;
  previousPosition: number;
};

type DailyMetric = {
  label: string;
  color: string;
  current: number[];
  previous: number[];
  currentText: string;
  previousText: string;
  changeText: string;
  changeClass: string;
};

const RANGE_OPTIONS = new Set([7, 14, 28, 90, 180, 365, 730]);
const SEARCH_TYPES = new Set(['web', 'discover', 'news', 'image', 'video']);

async function safeQuery(
  connectionId: string,
  siteUrl: string,
  body: Record<string, unknown>
): Promise<SafeReport> {
  try {
    const result = await querySite(connectionId, siteUrl, body);
    return { rows: result.rows || [], error: null };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : 'Unknown API error',
    };
  }
}

function metricNumber(
  row: SearchAnalyticsRow | undefined,
  key: 'clicks' | 'impressions' | 'ctr' | 'position'
) {
  return Number(row?.[key] || 0);
}

function mapRowsByKey(rows: SearchAnalyticsRow[]) {
  return new Map(rows.map((row) => [row.keys?.[0] || '', row]));
}

function enrichRows(currentRows: SearchAnalyticsRow[], previousRows: SearchAnalyticsRow[]): EnrichedRow[] {
  const previousMap = mapRowsByKey(previousRows);

  return currentRows
    .map((row) => {
      const key = row.keys?.[0] || '';
      const previous = previousMap.get(key);
      return {
        key,
        clicks: metricNumber(row, 'clicks'),
        impressions: metricNumber(row, 'impressions'),
        ctr: metricNumber(row, 'ctr'),
        position: metricNumber(row, 'position'),
        previousClicks: metricNumber(previous, 'clicks'),
        previousImpressions: metricNumber(previous, 'impressions'),
        previousCtr: metricNumber(previous, 'ctr'),
        previousPosition: metricNumber(previous, 'position'),
      };
    })
    .sort((a, b) => b.clicks - a.clicks);
}

function sum(items: EnrichedRow[], selector: (item: EnrichedRow) => number): number {
  return items.reduce((acc, item) => acc + selector(item), 0);
}

function weightedAverage(
  items: EnrichedRow[],
  valueSelector: (item: EnrichedRow) => number,
  weightSelector: (item: EnrichedRow) => number
) {
  const totalWeight = items.reduce((acc, item) => acc + weightSelector(item), 0);
  if (!totalWeight) return 0;
  return items.reduce((acc, item) => acc + valueSelector(item) * weightSelector(item), 0) / totalWeight;
}

function trendClass(value: number) {
  return value >= 0 ? 'good' : 'bad';
}

function formatTrend(value: number, digits = 1) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatDecimal(value, digits)}%`;
}

function formatPositionShift(current: number, previous: number) {
  const shift = previous - current;
  const sign = shift > 0 ? '+' : '';
  return `${sign}${formatDecimal(shift, 1)}`;
}

function buildMetricSeries(
  dailyCurrent: SearchAnalyticsRow[],
  dailyPrevious: SearchAnalyticsRow[]
): DailyMetric[] {
  const currentClicks = dailyCurrent.map((row) => metricNumber(row, 'clicks'));
  const previousClicks = dailyPrevious.map((row) => metricNumber(row, 'clicks'));
  const currentImpressions = dailyCurrent.map((row) => metricNumber(row, 'impressions'));
  const previousImpressions = dailyPrevious.map((row) => metricNumber(row, 'impressions'));
  const currentCtr = dailyCurrent.map((row) => metricNumber(row, 'ctr') * 100);
  const previousCtr = dailyPrevious.map((row) => metricNumber(row, 'ctr') * 100);
  const currentPosition = dailyCurrent.map((row) => metricNumber(row, 'position'));
  const previousPosition = dailyPrevious.map((row) => metricNumber(row, 'position'));

  const totalClicks = currentClicks.reduce((a, b) => a + b, 0);
  const prevClicks = previousClicks.reduce((a, b) => a + b, 0);
  const totalImpressions = currentImpressions.reduce((a, b) => a + b, 0);
  const prevImpressions = previousImpressions.reduce((a, b) => a + b, 0);
  const avgCtr = totalImpressions ? (totalClicks / totalImpressions) * 100 : 0;
  const prevCtr = prevImpressions ? (prevClicks / prevImpressions) * 100 : 0;
  const avgPosition = currentPosition.length
    ? currentPosition.reduce((a, b) => a + b, 0) / currentPosition.length
    : 0;
  const prevPosition = previousPosition.length
    ? previousPosition.reduce((a, b) => a + b, 0) / previousPosition.length
    : 0;

  return [
    {
      label: 'Clicks',
      color: '#2563eb',
      current: currentClicks,
      previous: previousClicks,
      currentText: formatNumber(totalClicks),
      previousText: formatNumber(prevClicks),
      changeText: formatTrend(deltaPercent(totalClicks, prevClicks)),
      changeClass: trendClass(deltaPercent(totalClicks, prevClicks)),
    },
    {
      label: 'Impressions',
      color: '#7c3aed',
      current: currentImpressions,
      previous: previousImpressions,
      currentText: formatNumber(totalImpressions),
      previousText: formatNumber(prevImpressions),
      changeText: formatTrend(deltaPercent(totalImpressions, prevImpressions)),
      changeClass: trendClass(deltaPercent(totalImpressions, prevImpressions)),
    },
    {
      label: 'CTR',
      color: '#0f766e',
      current: currentCtr,
      previous: previousCtr,
      currentText: `${formatDecimal(avgCtr, 1)}%`,
      previousText: `${formatDecimal(prevCtr, 1)}%`,
      changeText: formatTrend(deltaPercent(avgCtr, prevCtr)),
      changeClass: trendClass(deltaPercent(avgCtr, prevCtr)),
    },
    {
      label: 'Position',
      color: '#ea580c',
      current: currentPosition,
      previous: previousPosition,
      currentText: formatDecimal(avgPosition, 1),
      previousText: formatDecimal(prevPosition, 1),
      changeText: formatPositionShift(avgPosition, prevPosition),
      changeClass: trendClass(prevPosition - avgPosition),
    },
  ];
}

function deltaPercent(current: number, previous: number) {
  if (!previous && !current) return 0;
  if (!previous && current > 0) return 100;
  return ((current - previous) / previous) * 100;
}

function clampRange(raw: string | undefined) {
  const parsed = Number(raw || 90);
  return RANGE_OPTIONS.has(parsed) ? parsed : 90;
}

function normalizeSearchType(raw: string | undefined) {
  return SEARCH_TYPES.has(raw || 'web') ? (raw as string) : 'web';
}

function formatLabel(date: string) {
  return format(parseISO(date), 'MMM d');
}

function buildBucketSeries(rows: SearchAnalyticsRow[], labels: string[]) {
  const buckets = [
    { label: '1-3', min: 0, max: 3, color: '#facc15' },
    { label: '4-10', min: 3, max: 10, color: '#1d4ed8' },
    { label: '11-20', min: 10, max: 20, color: '#3b82f6' },
    { label: '21+', min: 20, max: Number.POSITIVE_INFINITY, color: '#93c5fd' },
  ];

  const dateIndex = new Map(labels.map((date, index) => [date, index]));
  const series = buckets.map((bucket) => ({ ...bucket, values: new Array(labels.length).fill(0) }));

  rows.forEach((row) => {
    const date = row.keys?.[0] || '';
    const index = dateIndex.get(date);
    if (index === undefined) return;
    const position = Number(row.position || 0);
    const bucket = series.find((item) => position > item.min && position <= item.max);
    if (!bucket) return;
    bucket.values[index] += 1;
  });

  return series;
}

function formatDeviceName(value: string) {
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function queryBase(searchType: string) {
  return {
    dataState: 'all' as const,
    ...(searchType !== 'web' ? { type: searchType } : {}),
  };
}

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ range?: string; searchType?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const incomingSearchParams = (await searchParams) || {};
  const rangeDays = clampRange(incomingSearchParams.range);
  const searchType = normalizeSearchType(incomingSearchParams.searchType);

  const property = await prisma.gscProperty.findUnique({
    where: { id },
    include: { connection: true },
  });

  if (!property) {
    notFound();
  }

  const range = defaultDateRange(rangeDays);
  const base = queryBase(searchType);

  const [
    dailyCurrent,
    dailyPrevious,
    pagesCurrent,
    pagesPrevious,
    queriesCurrent,
    queriesPrevious,
    devicesCurrent,
    devicesPrevious,
    countriesCurrent,
    countriesPrevious,
    queryCountDaily,
  ] = await Promise.all([
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['date'],
      rowLimit: rangeDays + 5,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.previousStartDate,
      endDate: range.previousEndDate,
      dimensions: ['date'],
      rowLimit: rangeDays + 5,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['page'],
      rowLimit: 100,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.previousStartDate,
      endDate: range.previousEndDate,
      dimensions: ['page'],
      rowLimit: 100,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['query'],
      rowLimit: 100,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.previousStartDate,
      endDate: range.previousEndDate,
      dimensions: ['query'],
      rowLimit: 100,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['device'],
      rowLimit: 10,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.previousStartDate,
      endDate: range.previousEndDate,
      dimensions: ['device'],
      rowLimit: 10,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['country'],
      rowLimit: 50,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.previousStartDate,
      endDate: range.previousEndDate,
      dimensions: ['country'],
      rowLimit: 50,
      ...base,
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['date', 'query'],
      rowLimit: 25000,
      ...base,
    }),
  ]);

  const pageRows = enrichRows(pagesCurrent.rows, pagesPrevious.rows);
  const queryRows = enrichRows(queriesCurrent.rows, queriesPrevious.rows);
  const deviceRows = enrichRows(devicesCurrent.rows, devicesPrevious.rows).map((row) => ({
    ...row,
    key: formatDeviceName(row.key),
  }));
  const countryRows = enrichRows(countriesCurrent.rows, countriesPrevious.rows).map((row) => ({
    ...row,
    key: countryName(row.key),
  }));

  const newRankings = queryRows
    .filter((row) => row.previousImpressions === 0 && row.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 50);

  const chartSeries = buildMetricSeries(dailyCurrent.rows, dailyPrevious.rows);
  const currentLabels = dailyCurrent.rows.map((row) => formatLabel(row.keys?.[0] || range.startDate));
  const previousLabels = dailyPrevious.rows.map((row) =>
    formatLabel(row.keys?.[0] || range.previousStartDate)
  );
  const bucketLabels = dailyCurrent.rows.map((row) => row.keys?.[0] || '');
  const bucketSeries = buildBucketSeries(queryCountDaily.rows, bucketLabels);

  const overviewCards = [
    {
      label: 'Queries',
      current: formatNumber(queryRows.length),
      change: formatTrend(
        deltaPercent(
          sum(queryRows, (row) => row.clicks),
          sum(queryRows, (row) => row.previousClicks)
        )
      ),
      changeClass: trendClass(
        deltaPercent(
          sum(queryRows, (row) => row.clicks),
          sum(queryRows, (row) => row.previousClicks)
        )
      ),
    },
    {
      label: 'Pages',
      current: formatNumber(pageRows.length),
      change: formatTrend(
        deltaPercent(
          sum(pageRows, (row) => row.clicks),
          sum(pageRows, (row) => row.previousClicks)
        )
      ),
      changeClass: trendClass(
        deltaPercent(
          sum(pageRows, (row) => row.clicks),
          sum(pageRows, (row) => row.previousClicks)
        )
      ),
    },
    {
      label: 'Countries',
      current: formatNumber(countryRows.length),
      change: formatTrend(
        deltaPercent(
          sum(countryRows, (row) => row.clicks),
          sum(countryRows, (row) => row.previousClicks)
        )
      ),
      changeClass: trendClass(
        deltaPercent(
          sum(countryRows, (row) => row.clicks),
          sum(countryRows, (row) => row.previousClicks)
        )
      ),
    },
    {
      label: 'Devices',
      current: formatNumber(deviceRows.length),
      change: `${formatDecimal(
        weightedAverage(deviceRows, (row) => row.position, (row) => row.impressions),
        1
      )} avg pos`,
      changeClass: 'good',
    },
  ];

  const errors = [
    dailyCurrent,
    dailyPrevious,
    pagesCurrent,
    pagesPrevious,
    queriesCurrent,
    queriesPrevious,
    devicesCurrent,
    devicesPrevious,
    countriesCurrent,
    countriesPrevious,
    queryCountDaily,
  ]
    .map((report) => report.error)
    .filter(Boolean) as string[];

  return (
    <main className="page-shell site-shell">
      <section className="panel site-hero-panel">
        <div className="site-hero-head">
          <div>
            <div className="badge">Site workspace</div>
            <h1>{property.label || property.siteUrl}</h1>
            <p className="muted">{property.siteUrl}</p>
            <p className="muted">Connected Google account: {property.connection.email}</p>
          </div>
          <div className="header-actions">
            <form action={`/api/connections/${property.connectionId}/sync`} method="post">
              <button className="button small" type="submit">
                Refresh sites
              </button>
            </form>
            <Link className="button ghost small" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>

        <div className="site-top-cards">
          {overviewCards.map((card) => (
            <div key={card.label} className="site-top-card">
              <span>{card.label}</span>
              <strong>{card.current}</strong>
              <em className={card.changeClass}>{card.change}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="panel site-detail-panel site-controls-panel">
        <SiteControls currentRange={rangeDays} currentSearchType={searchType} />
      </section>

      {errors.length > 0 ? (
        <div className="alert error">
          Some reports could not be loaded for this site. If you recently removed this property in
          Search Console, press “Refresh sites” on the connected account so stale properties are
          removed from the app database.
        </div>
      ) : null}

      <section className="panel site-detail-panel">
        <SiteTrendChart series={chartSeries} labels={currentLabels} previousLabels={previousLabels} />
      </section>

      <section className="grid two-columns site-grid-gap">
        <WorkspaceTable title="Queries" rows={queryRows} keyLabel="Query" />
        <WorkspaceTable title="Pages" rows={pageRows} keyLabel="Page" />
      </section>

      <section className="grid two-columns site-grid-gap">
        <BrandedKeywordsPanel
          propertyId={property.id}
          rows={queryRows.map((row) => ({
            key: row.key,
            clicks: row.clicks,
            previousClicks: row.previousClicks,
          }))}
        />
        <QueryCountingChart labels={bucketLabels.map((item) => formatLabel(item))} series={bucketSeries} />
      </section>

      <section className="grid two-columns site-grid-gap">
        <WorkspaceTable title="Countries" rows={countryRows} keyLabel="Country" />
        <WorkspaceTable title="New rankings" rows={newRankings} keyLabel="Query" />
      </section>

      <WorkspaceTable title="Devices" rows={deviceRows} keyLabel="Device" />
    </main>
  );
}