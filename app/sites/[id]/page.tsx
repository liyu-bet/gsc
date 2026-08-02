import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { querySite, SearchAnalyticsRow } from '@/lib/google';
import { countryName } from '@/lib/countries';
import {
  buildComparisonRange,
  buildCustomComparisonRange,
  enumerateDates,
  gscCalendarDate,
  normalizeGscDate,
  parseAllowedRange,
  type AllowedRangeDays,
  type ComparisonDateRange,
} from '@/lib/date-ranges';
import { formatDecimal, formatNumber } from '@/lib/format';
import {
  countDeltaClass,
  formatCountDelta,
  metricDelta,
  positionImprovement,
  summarizeMetricRows,
  weightedAveragePosition,
} from '@/lib/metrics';
import { deviceLabel } from '@/lib/ui-labels';
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
  position: number;
  previousClicks: number;
  previousImpressions: number;
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
      error: error instanceof Error ? error.message : 'Неизвестная ошибка API',
    };
  }
}

function metricNumber(row: SearchAnalyticsRow | undefined, key: 'clicks' | 'impressions' | 'position') {
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
        position: metricNumber(row, 'position'),
        previousClicks: metricNumber(previous, 'clicks'),
        previousImpressions: metricNumber(previous, 'impressions'),
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

function buildMetricSeries(dailyCurrent: AlignedDailyRow[], dailyPrevious: AlignedDailyRow[]): DailyMetric[] {
  const currentClicks = dailyCurrent.map((row) => row.clicks);
  const previousClicks = dailyPrevious.map((row) => row.clicks);
  const currentImpressions = dailyCurrent.map((row) => row.impressions);
  const previousImpressions = dailyPrevious.map((row) => row.impressions);
  const currentPosition = dailyCurrent.map((row) => row.position);
  const previousPosition = dailyPrevious.map((row) => row.position);

  const currentTotals = summarizeMetricRows(dailyCurrent);
  const previousTotals = summarizeMetricRows(dailyPrevious);
  const clicksDelta = metricDelta(currentTotals.clicks, previousTotals.clicks);
  const impressionsDelta = metricDelta(currentTotals.impressions, previousTotals.impressions);
  const avgPosition = weightedAveragePosition(dailyCurrent);
  const prevPosition = weightedAveragePosition(dailyPrevious);
  const positionShift = positionImprovement(avgPosition, prevPosition);

  return [
    {
      label: 'Клики',
      color: '#2563eb',
      current: currentClicks,
      previous: previousClicks,
      currentText: formatNumber(currentTotals.clicks),
      previousText: formatNumber(previousTotals.clicks),
      changeText: formatTrend(clicksDelta.deltaPct),
      changeClass: trendClass(clicksDelta.deltaPct),
    },
    {
      label: 'Показы',
      color: '#7c3aed',
      current: currentImpressions,
      previous: previousImpressions,
      currentText: formatNumber(currentTotals.impressions),
      previousText: formatNumber(previousTotals.impressions),
      changeText: formatTrend(impressionsDelta.deltaPct),
      changeClass: trendClass(impressionsDelta.deltaPct),
    },
    {
      label: 'Позиция',
      color: '#ea580c',
      current: currentPosition,
      previous: previousPosition,
      currentText: formatDecimal(avgPosition, 1),
      previousText: formatDecimal(prevPosition, 1),
      changeText: formatPositionShift(avgPosition, prevPosition),
      changeClass: trendClass(positionShift),
    },
  ];
}

function formatTrend(value: number, digits = 1) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatDecimal(value, digits)}%`;
}

function formatPositionShift(current: number, previous: number) {
  const shift = positionImprovement(current, previous);
  const sign = shift > 0 ? '+' : '';
  return `${sign}${formatDecimal(shift, 1)}`;
}

function normalizeSearchType(raw: string | undefined) {
  return SEARCH_TYPES.has(raw || 'web') ? (raw as string) : 'web';
}

function formatLabel(date: string) {
  return format(parseISO(date), 'd MMM', { locale: ru });
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
  return deviceLabel(value);
}

function queryBase(searchType: string) {
  return {
    dataState: 'all' as const,
    ...(searchType !== 'web' ? { type: searchType } : {}),
  };
}

function buildDateRange(
  days: AllowedRangeDays,
  endDate: string,
  startDate?: string
): ComparisonDateRange & { custom: boolean } {
  if (!startDate) {
    return { ...buildComparisonRange(days, endDate), custom: false };
  }

  const custom = buildCustomComparisonRange(startDate, endDate);
  if (!custom) {
    return { ...buildComparisonRange(days, endDate), custom: false };
  }

  return { ...custom, custom: true };
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
  position: number;
};

function alignDailyRows(alignedDates: string[], rows: SearchAnalyticsRow[]): AlignedDailyRow[] {
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

  const rangeDays = parseAllowedRange(incoming.range, 90);
  const searchType = normalizeSearchType(incoming.searchType);
  const endDate = normalizeGscDate(incoming.endDate, gscCalendarDate());
  const startDate = incoming.startDate ? normalizeGscDate(incoming.startDate, endDate) : undefined;
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

  const currentQueryCount = queriesCurrent.rows.length;
  const previousQueryCount = queriesPrevious.rows.length;
  const currentPageCount = pagesCurrent.rows.length;
  const previousPageCount = pagesPrevious.rows.length;
  const queryCountDelta = currentQueryCount - previousQueryCount;
  const pageCountDelta = currentPageCount - previousPageCount;

  const overviewCards = [
    {
      label: 'Запросы в выдаче',
      current: formatNumber(currentQueryCount),
      change: formatCountDelta(queryCountDelta, 'query', 'queries'),
      changeClass: countDeltaClass(queryCountDelta),
    },
    {
      label: 'Страницы в выдаче',
      current: formatNumber(currentPageCount),
      change: formatCountDelta(pageCountDelta, 'page', 'pages'),
      changeClass: countDeltaClass(pageCountDelta),
    },
    {
      label: 'Страны',
      current: formatNumber(countryRows.length),
      change: formatTrend(metricDelta(sum(countryRows, (row) => row.clicks), sum(countryRows, (row) => row.previousClicks)).deltaPct),
      changeClass: trendClass(metricDelta(sum(countryRows, (row) => row.clicks), sum(countryRows, (row) => row.previousClicks)).deltaPct),
    },
    {
      label: 'Устройства',
      current: formatNumber(deviceRows.length),
      change: `${formatDecimal(weightedAverage(deviceRows, (row) => row.position, (row) => row.impressions), 1)} ср. поз.`,
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
    activeFilters.query ? { label: 'Запрос', value: activeFilters.query, href: siteHref(id, baseParams, { query: undefined }) } : null,
    activeFilters.page ? { label: 'Страница', value: activeFilters.page, href: siteHref(id, baseParams, { page: undefined }) } : null,
    activeFilters.country ? { label: 'Страна', value: countryName(activeFilters.country), href: siteHref(id, baseParams, { country: undefined }) } : null,
    activeFilters.device ? { label: 'Устройство', value: formatDeviceName(activeFilters.device), href: siteHref(id, baseParams, { device: undefined }) } : null,
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
            <div className="badge">Рабочая область сайта</div>
            <h1>{property.label || property.siteUrl}</h1>
            <p className="muted">{property.siteUrl}</p>
            <p className="muted">Подключённый аккаунт Google: {property.connection.email}</p>
            <p className="muted">
              Текущий период: {range.startDate} → {range.endDate} · Последняя доступная дата: {gscCalendarDate()}
            </p>
          </div>
          <div className="header-actions">
            <Link className="button ghost small" href={`/dashboard?range=${rangeDays}&searchType=${searchType}`} prefetch>
              Назад к панели
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
          latestDate={gscCalendarDate()}
          isCustom={range.custom}
        />
      </section>

      <SiteFilterBar filters={filterChipData} clearHref={clearFiltersHref} />

      {errors.length > 0 ? (
        <div className="alert error">
          Часть отчётов для этого сайта не загрузилась. Если ресурс недавно удалили в Search Console, нажмите «Обновить сайты» у подключения на панели — устаревшие ресурсы исчезнут из базы приложения.
        </div>
      ) : null}

      <section className="panel site-detail-panel">
        <SiteTrendChart series={chartSeries} labels={currentLabels} previousLabels={previousLabels} />
      </section>

      <section className="grid two-columns site-grid-gap">
        <WorkspaceTable title="Запросы" rows={queryRows} keyLabel="Запрос" />
        <WorkspaceTable title="Страницы" rows={pageRows} keyLabel="Страница" />
      </section>

      <section className="grid two-columns site-grid-gap">
        <QueryCountingChart labels={alignedCurrentDates.map((item) => formatLabel(item))} series={bucketSeries} />
        <WorkspaceTable title="Страны" rows={countryRows} keyLabel="Страна" />
      </section>

      <section className="grid two-columns site-grid-gap">
        <WorkspaceTable title="Новые позиции" rows={newRankings} keyLabel="Запрос" />
        <WorkspaceTable title="Устройства" rows={deviceRows} keyLabel="Устройство" />
      </section>
    </main>
  );
}
