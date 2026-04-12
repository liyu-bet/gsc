import Link from 'next/link';
import { addDays, differenceInCalendarDays, format, isValid, parseISO, subDays } from 'date-fns';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { defaultDateRange, latestAvailableDate, querySite, SearchAnalyticsRow } from '@/lib/google';
import { countryName } from '@/lib/countries';
import { formatDecimal, formatNumber } from '@/lib/format';
import { SiteTrendChart } from '@/components/site/SiteTrendChart';
import { WorkspaceTable } from '@/components/site/WorkspaceTable';
import { QueryCountingChart } from '@/components/site/QueryCountingChart';
import { SiteControls } from '@/components/site/SiteControls';
import { SiteFilterBar } from '@/components/site/SiteFilterBar';

type SafeReport = {
  rows: SearchAnalyticsRow[];
  error?: string | null;
};

type EnrichedRow = {
  key: string;
  rawKey: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previousClicks: number;
  previousImpressions: number;
  previousCtr: number;
  previousPosition: number;
  href?: string;
  active?: boolean;
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

type ActiveFilters = {
  query?: string;
  page?: string;
  country?: string;
  device?: string;
};

type SiteSearchParams = {
  range?: string;
  searchType?: string;
  endDate?: string;
  startDate?: string;
  query?: string;
  page?: string;
  country?: string;
  device?: string;
};

const RANGE_OPTIONS = new Set([1, 7, 14, 28, 90, 180, 365, 730]);
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

function metricNumber(row: SearchAnalyticsRow | undefined, key: 'clicks' | 'impressions' | 'ctr' | 'position') {
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
        rawKey: key,
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

function weightedAverage(items: EnrichedRow[], valueSelector: (item: EnrichedRow) => number, weightSelector: (item: EnrichedRow) => number) {
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

function buildMetricSeries(dailyCurrent: AlignedDailyRow[], dailyPrevious: AlignedDailyRow[]): DailyMetric[] {
  const currentClicks = dailyCurrent.map((row) => row.clicks);
  const previousClicks = dailyPrevious.map((row) => row.clicks);
  const currentImpressions = dailyCurrent.map((row) => row.impressions);
  const previousImpressions = dailyPrevious.map((row) => row.impressions);
  const currentCtr = dailyCurrent.map((row) => row.ctr * 100);
  const previousCtr = dailyPrevious.map((row) => row.ctr * 100);
  const currentPosition = dailyCurrent.map((row) => row.position);
  const previousPosition = dailyPrevious.map((row) => row.position);

  const totalClicks = currentClicks.reduce((a, b) => a + b, 0);
  const prevClicks = previousClicks.reduce((a, b) => a + b, 0);
  const totalImpressions = currentImpressions.reduce((a, b) => a + b, 0);
  const prevImpressions = previousImpressions.reduce((a, b) => a + b, 0);
  const avgCtr = totalImpressions ? (totalClicks / totalImpressions) * 100 : 0;
  const prevCtr = prevImpressions ? (prevClicks / prevImpressions) * 100 : 0;
  const avgPosition = currentPosition.length ? currentPosition.reduce((a, b) => a + b, 0) / currentPosition.length : 0;
  const prevPosition = previousPosition.length ? previousPosition.reduce((a, b) => a + b, 0) / previousPosition.length : 0;

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

function normalizeDate(raw: string | undefined, fallback: string) {
  if (!raw) return fallback;
  try {
    const parsed = parseISO(raw);
    return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : fallback;
  } catch {
    return fallback;
  }
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

function buildDateRange(days: number, endDate: string, startDate?: string) {
  if (!startDate) {
    return { ...defaultDateRange(days, endDate), custom: false };
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (!isValid(start) || !isValid(end) || start > end) {
    return { ...defaultDateRange(days, endDate), custom: false };
  }

  const span = differenceInCalendarDays(end, start) + 1;
  const previousEnd = subDays(start, 1);
  const previousStart = subDays(previousEnd, span - 1);

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    previousStartDate: format(previousStart, 'yyyy-MM-dd'),
    previousEndDate: format(previousEnd, 'yyyy-MM-dd'),
    custom: true,
  };
}

function buildFilterGroups(filters: ActiveFilters) {
  const items = [] as Array<{ dimension: string; expression: string; operator: 'equals' }>;
  if (filters.query) items.push({ dimension: 'query', expression: filters.query, operator: 'equals' });
  if (filters.page) items.push({ dimension: 'page', expression: filters.page, operator: 'equals' });
  if (filters.country) items.push({ dimension: 'country', expression: filters.country, operator: 'equals' });
  if (filters.device) items.push({ dimension: 'device', expression: filters.device, operator: 'equals' });
  return items.length ? [{ groupType: 'and', filters: items }] : undefined;
}

function queryBody(base: ReturnType<typeof queryBase>, startDate: string, endDate: string, dimensions: string[], rowLimit: number, filters: ActiveFilters) {
  return {
    startDate,
    endDate,
    dimensions,
    rowLimit,
    ...base,
    ...(buildFilterGroups(filters) ? { dimensionFilterGroups: buildFilterGroups(filters) } : {}),
  };
}

function siteHref(propertyId: string, params: SiteSearchParams, updates: Partial<Record<keyof SiteSearchParams, string | undefined>>) {
  const next = new URLSearchParams();
  const merged = { ...params, ...updates };
  for (const [key, value] of Object.entries(merged)) {
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/sites/${propertyId}?${query}` : `/sites/${propertyId}`;
}

type AlignedDailyRow = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

function enumerateDates(startDate: string, endDate: string): string[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const length = differenceInCalendarDays(end, start);
  return Array.from({ length: length + 1 }, (_, index) => format(addDays(start, index), 'yyyy-MM-dd'));
}

function alignDailyRows(alignedDates: string[], rows: SearchAnalyticsRow[]): AlignedDailyRow[] {
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

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SiteSearchParams>;
}) {
  await requireAdmin();
  const { id } = await params;
  const incoming = (await searchParams) || {};

  const rangeDays = clampRange(incoming.range);
  const searchType = normalizeSearchType(incoming.searchType);
  const endDate = normalizeDate(incoming.endDate, latestAvailableDate());
  const startDate = incoming.startDate ? normalizeDate(incoming.startDate, endDate) : undefined;
  const activeFilters: ActiveFilters = {
    query: incoming.query,
    page: incoming.page,
    country: incoming.country,
    device: incoming.device,
  };

  const property = await prisma.gscProperty.findUnique({
    where: { id },
    include: { connection: true },
  });

  if (!property) notFound();

  const range = buildDateRange(rangeDays, endDate, startDate);
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
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.startDate, range.endDate, ['date'], 400, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.previousStartDate, range.previousEndDate, ['date'], 400, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.startDate, range.endDate, ['page'], 250, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.previousStartDate, range.previousEndDate, ['page'], 250, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.startDate, range.endDate, ['query'], 250, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.previousStartDate, range.previousEndDate, ['query'], 250, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.startDate, range.endDate, ['device'], 20, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.previousStartDate, range.previousEndDate, ['device'], 20, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.startDate, range.endDate, ['country'], 100, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.previousStartDate, range.previousEndDate, ['country'], 100, activeFilters)),
    safeQuery(property.connectionId, property.siteUrl, queryBody(base, range.startDate, range.endDate, ['date', 'query'], 25000, activeFilters)),
  ]);

  const alignedCurrentDates = enumerateDates(range.startDate, range.endDate);
  const alignedPreviousDates = enumerateDates(range.previousStartDate, range.previousEndDate);
  const alignedDailyCurrent = alignDailyRows(alignedCurrentDates, dailyCurrent.rows);
  const alignedDailyPrevious = alignDailyRows(alignedPreviousDates, dailyPrevious.rows);

  const baseParams: SiteSearchParams = {
    range: String(rangeDays),
    searchType,
    endDate,
    ...(range.custom && startDate ? { startDate } : {}),
    ...activeFilters,
  };

  function attachHref(rows: EnrichedRow[], param: keyof ActiveFilters) {
    return rows.map((row) => {
      const isActive = activeFilters[param] === row.rawKey;
      return {
        ...row,
        active: isActive,
        href: siteHref(id, baseParams, { [param]: isActive ? undefined : row.rawKey }),
      };
    });
  }

  const pageRows = attachHref(enrichRows(pagesCurrent.rows, pagesPrevious.rows), 'page');
  const queryRows = attachHref(enrichRows(queriesCurrent.rows, queriesPrevious.rows), 'query');
  const deviceRows = attachHref(
    enrichRows(devicesCurrent.rows, devicesPrevious.rows).map((row) => ({
      ...row,
      key: formatDeviceName(row.key),
      rawKey: row.rawKey,
    })),
    'device'
  );
  const countryRows = attachHref(
    enrichRows(countriesCurrent.rows, countriesPrevious.rows).map((row) => ({
      ...row,
      key: countryName(row.key),
      rawKey: row.rawKey,
    })),
    'country'
  );

  const newRankings = attachHref(
    enrichRows(queriesCurrent.rows, queriesPrevious.rows)
      .filter((row) => row.previousImpressions === 0 && row.impressions > 0)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 50),
    'query'
  );

  const chartSeries = buildMetricSeries(alignedDailyCurrent, alignedDailyPrevious);
  const currentLabels = alignedDailyCurrent.map((row) => formatLabel(row.date));
  const previousLabels = alignedDailyPrevious.map((row) => formatLabel(row.date));
  const bucketSeries = buildBucketSeries(queryCountDaily.rows, alignedCurrentDates);

  const overviewCards = [
    {
      label: 'Ranking queries',
      current: formatNumber(queryRows.length),
      change: formatTrend(deltaPercent(sum(queryRows, (row) => row.clicks), sum(queryRows, (row) => row.previousClicks))),
      changeClass: trendClass(deltaPercent(sum(queryRows, (row) => row.clicks), sum(queryRows, (row) => row.previousClicks))),
    },
    {
      label: 'Ranking pages',
      current: formatNumber(pageRows.length),
      change: formatTrend(deltaPercent(sum(pageRows, (row) => row.clicks), sum(pageRows, (row) => row.previousClicks))),
      changeClass: trendClass(deltaPercent(sum(pageRows, (row) => row.clicks), sum(pageRows, (row) => row.previousClicks))),
    },
    {
      label: 'Countries',
      current: formatNumber(countryRows.length),
      change: formatTrend(deltaPercent(sum(countryRows, (row) => row.clicks), sum(countryRows, (row) => row.previousClicks))),
      changeClass: trendClass(deltaPercent(sum(countryRows, (row) => row.clicks), sum(countryRows, (row) => row.previousClicks))),
    },
    {
      label: 'Devices',
      current: formatNumber(deviceRows.length),
      change: `${formatDecimal(weightedAverage(deviceRows, (row) => row.position, (row) => row.impressions), 1)} avg pos`,
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

  const filterChipData = [
    activeFilters.query ? { label: 'Query', value: activeFilters.query, href: siteHref(id, baseParams, { query: undefined }) } : null,
    activeFilters.page ? { label: 'Page', value: activeFilters.page, href: siteHref(id, baseParams, { page: undefined }) } : null,
    activeFilters.country ? { label: 'Country', value: countryName(activeFilters.country), href: siteHref(id, baseParams, { country: undefined }) } : null,
    activeFilters.device ? { label: 'Device', value: formatDeviceName(activeFilters.device), href: siteHref(id, baseParams, { device: undefined }) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; href: string }>;

  const clearFiltersHref = siteHref(id, baseParams, {
    query: undefined,
    page: undefined,
    country: undefined,
    device: undefined,
  });

  return (
    <main className="page-shell site-shell">
      <section className="panel site-hero-panel">
        <div className="site-hero-head">
          <div>
            <div className="badge">Site workspace</div>
            <h1>{property.label || property.siteUrl}</h1>
            <p className="muted">{property.siteUrl}</p>
            <p className="muted">Connected Google account: {property.connection.email}</p>
            <p className="muted">
              Current range: {range.startDate} → {range.endDate} · Last available date: {latestAvailableDate()}
            </p>
          </div>
          <div className="header-actions">
            <Link className="button ghost small" href={`/dashboard?range=${rangeDays}&searchType=${searchType}`} prefetch>
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
        <SiteControls
          currentRange={rangeDays}
          currentSearchType={searchType}
          currentEndDate={endDate}
          currentStartDate={startDate}
          latestDate={latestAvailableDate()}
          isCustom={range.custom}
        />
      </section>

      <SiteFilterBar filters={filterChipData} clearHref={clearFiltersHref} />

      {errors.length > 0 ? (
        <div className="alert error">
          Some reports could not be loaded for this site. If you recently removed this property in Search Console, press “Refresh sites” on the dashboard connection so stale properties are removed from the app database.
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
        <QueryCountingChart labels={alignedCurrentDates.map((item) => formatLabel(item))} series={bucketSeries} />
        <WorkspaceTable title="Countries" rows={countryRows} keyLabel="Country" />
      </section>

      <section className="grid two-columns site-grid-gap">
        <WorkspaceTable title="New rankings" rows={newRankings} keyLabel="Query" />
        <WorkspaceTable title="Devices" rows={deviceRows} keyLabel="Device" />
      </section>
    </main>
  );
}
