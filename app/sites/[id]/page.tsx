import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { querySite, SearchAnalyticsResponse, SearchAnalyticsRow } from '@/lib/google';
import { GoogleApiError } from '@/lib/google-errors';
import { isBlockedConnectionStatus } from '@/lib/connection-status';
import { countryName } from '@/lib/countries';
import {
  buildComparisonRange,
  buildCustomComparisonRange,
  enumerateDates,
  gscCalendarDate,
  normalizeGscDate,
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
} from '@/lib/metrics';
import {
  aggregateDetailRowsForWindow,
  buildLatestHourlyWindows,
  enrichAggregatedRows,
  hoursAgoLabel,
  hourlyFetchDateSpan,
  normalizeDetailHourRows,
  normalizeHourlyRows,
  summarizeHourWindow,
  type HourWindow,
} from '@/lib/hourly-ranges';
import { parsePeriodParams } from '@/lib/periods';
import {
  buildDailyRequest,
  buildHourlyDetailRequest,
  buildHourlyTotalsRequest,
  type ActiveDimensionFilters,
} from '@/lib/search-analytics-request';
import { deviceLabel } from '@/lib/ui-labels';
import { SiteTrendChart, type TrendSeriesPoint } from '@/components/site/SiteTrendChart';
import { WorkspaceTable } from '@/components/site/WorkspaceTable';
import { QueryCountingChart } from '@/components/site/QueryCountingChart';
import { SiteControls } from '@/components/site/SiteControls';
import { SiteFilterBar } from '@/components/site/SiteFilterBar';
import { PeriodFreshness } from '@/components/site/PeriodFreshness';
import { DataDiagnostics, type DiagnosticsPayload } from '@/components/site/DataDiagnostics';

type SafeReport = {
  rows: SearchAnalyticsRow[];
  error?: string | null;
  responseAggregationType?: string | null;
  firstIncompleteDate?: string | null;
  firstIncompleteHour?: string | null;
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

type ActiveFilters = ActiveDimensionFilters;

type SiteSearchParams = {
  period?: string;
  range?: string;
  searchType?: string;
  endDate?: string;
  startDate?: string;
  compare?: string;
  query?: string;
  page?: string;
  country?: string;
  device?: string;
};

const SEARCH_TYPES = new Set(['web', 'discover', 'news', 'image', 'video']);
const DETAIL_PAGE_SIZE = 25000;
const DETAIL_MAX_PAGES = 3;

async function safeQuery(
  connectionId: string,
  siteUrl: string,
  body: Record<string, unknown>
): Promise<SafeReport> {
  try {
    const result: SearchAnalyticsResponse = await querySite(connectionId, siteUrl, body);
    return {
      rows: result.rows || [],
      error: null,
      responseAggregationType: result.responseAggregationType || null,
      firstIncompleteDate: result.metadata?.first_incomplete_date || null,
      firstIncompleteHour: result.metadata?.first_incomplete_hour || null,
    };
  } catch (error) {
    return {
      rows: [],
      error:
        error instanceof GoogleApiError
          ? error.safeMessage
          : 'Неизвестная ошибка API',
      responseAggregationType: null,
      firstIncompleteDate: null,
      firstIncompleteHour: null,
    };
  }
}

async function safeQueryPaginated(
  connectionId: string,
  siteUrl: string,
  body: Record<string, unknown>
): Promise<SafeReport & { truncated: boolean }> {
  const allRows: SearchAnalyticsRow[] = [];
  let truncated = false;
  let firstIncompleteHour: string | null = null;
  let firstIncompleteDate: string | null = null;
  let responseAggregationType: string | null = null;
  let error: string | null = null;

  for (let page = 0; page < DETAIL_MAX_PAGES; page += 1) {
    const startRow = page * DETAIL_PAGE_SIZE;
    const result = await safeQuery(connectionId, siteUrl, {
      ...body,
      startRow,
      rowLimit: DETAIL_PAGE_SIZE,
    });
    if (result.error) {
      error = result.error;
      break;
    }
    firstIncompleteHour = result.firstIncompleteHour || firstIncompleteHour;
    firstIncompleteDate = result.firstIncompleteDate || firstIncompleteDate;
    responseAggregationType = result.responseAggregationType || responseAggregationType;
    allRows.push(...result.rows);
    if (result.rows.length < DETAIL_PAGE_SIZE) break;
    if (page === DETAIL_MAX_PAGES - 1) truncated = true;
  }

  return {
    rows: allRows,
    error,
    truncated,
    firstIncompleteHour,
    firstIncompleteDate,
    responseAggregationType,
  };
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
  const shift = positionImprovement(current, previous);
  const sign = shift > 0 ? '+' : '';
  return `${sign}${formatDecimal(shift, 1)}`;
}

function normalizeSearchType(raw: string | undefined) {
  return SEARCH_TYPES.has(raw || 'web') ? (raw as string) : 'web';
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

function siteHref(
  propertyId: string,
  params: SiteSearchParams,
  updates: Partial<Record<keyof SiteSearchParams, string | undefined>>
) {
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

function windowToPoints(window: HourWindow): TrendSeriesPoint[] {
  return window.rows.map((row) => ({
    key: row.hour,
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.position ?? 0,
  }));
}

function dailyToPoints(rows: AlignedDailyRow[]): TrendSeriesPoint[] {
  return rows.map((row) => ({
    key: row.date,
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.position,
  }));
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
  const fetchedAt = new Date();

  const period = parsePeriodParams({
    period: incoming.period,
    range: incoming.range,
    startDate: incoming.startDate,
    endDate: incoming.endDate,
  });

  const searchType = normalizeSearchType(incoming.searchType);
  const compareDefault = period.compareDefault;
  const compare =
    incoming.compare === '1' ? true : incoming.compare === '0' ? false : compareDefault;

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

  const connectionBlocked = isBlockedConnectionStatus(property.connection.status);
  const blockedMessage =
    property.connection.lastErrorMessage ||
    'Аккаунт Google недоступен — переподключите, чтобы обновить метрики';

  const baseParams: SiteSearchParams = {
    period: period.id,
    searchType,
    compare: compare ? '1' : '0',
    ...(period.mode === 'custom'
      ? { startDate: period.startDate, endDate: period.endDate }
      : {}),
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

  let currentQueryCount = 0;
  let previousQueryCount = 0;
  let currentPageCount = 0;
  let previousPageCount = 0;
  let pageRows: EnrichedRow[] = [];
  let queryRows: EnrichedRow[] = [];
  let deviceRows: EnrichedRow[] = [];
  let countryRows: EnrichedRow[] = [];
  let newRankings: EnrichedRow[] = [];
  let chartMode: 'hourly' | 'daily' = 'daily';
  let currentPoints: TrendSeriesPoint[] = [];
  let previousPoints: TrendSeriesPoint[] = [];
  let firstIncompleteKey: string | null = null;
  let bucketSeries: ReturnType<typeof buildBucketSeries> | null = null;
  let bucketLabels: string[] = [];
  let hideQueryCounting = false;
  let detailTruncated = false;
  let errors: string[] = [];
  let diagnostics: DiagnosticsPayload | null = null;
  let totalsCurrent = { clicks: 0, impressions: 0, position: 0 };
  let totalsPrevious = { clicks: 0, impressions: 0, position: 0 };
  let latestAvailableHour: string | null = null;
  let firstIncompleteHour: string | null = null;
  let currentWindowStart: string | null = null;
  let currentWindowEnd: string | null = null;
  let previousWindowStart: string | null = null;
  let previousWindowEnd: string | null = null;
  let dailyStart: string | null = null;
  let dailyEnd: string | null = null;
  let hourlyRowCount = 0;
  let aggregationType: string | null = null;
  let responseAggregationType: string | null = null;
  let apiDimensions: string[] = ['date'];
  let apiDataState = 'all';

  if (connectionBlocked) {
    errors.push(blockedMessage);
  } else if (period.mode === 'hourly') {
    chartMode = 'hourly';
    hideQueryCounting = true;
    const span = hourlyFetchDateSpan(fetchedAt, 72);
    const totalsBody = buildHourlyTotalsRequest({
      startDate: span.startDate,
      endDate: span.endDate,
      searchType,
      filters: activeFilters,
    });
    aggregationType = totalsBody.aggregationType || null;
    apiDimensions = totalsBody.dimensions;
    apiDataState = totalsBody.dataState;

    const hourlyTotals = await safeQuery(property.connectionId, property.siteUrl, totalsBody);
    responseAggregationType = hourlyTotals.responseAggregationType || null;
    firstIncompleteHour = hourlyTotals.firstIncompleteHour || null;
    firstIncompleteKey = firstIncompleteHour;
    if (hourlyTotals.error) errors.push(hourlyTotals.error);

    const normalized = normalizeHourlyRows(hourlyTotals.rows);
    hourlyRowCount = normalized.length;
    const windows = buildLatestHourlyWindows(normalized, 24);
    latestAvailableHour = windows.latestAvailableHour;
    currentWindowStart = windows.current.start || null;
    currentWindowEnd = windows.current.end || null;
    previousWindowStart = windows.previous.start || null;
    previousWindowEnd = windows.previous.end || null;
    currentPoints = windowToPoints(windows.current);
    previousPoints = windowToPoints(windows.previous);
    totalsCurrent = summarizeHourWindow(windows.current);
    totalsPrevious = summarizeHourWindow(windows.previous);

    const detailDims = ['query', 'page', 'country', 'device'] as const;
    const detailReports = await Promise.all(
      detailDims.map((secondaryDimension) =>
        safeQueryPaginated(
          property.connectionId,
          property.siteUrl,
          buildHourlyDetailRequest({
            startDate: span.startDate,
            endDate: span.endDate,
            secondaryDimension,
            searchType,
            filters: activeFilters,
          })
        )
      )
    );

    for (const report of detailReports) {
      if (report.error) errors.push(report.error);
      if (report.truncated) detailTruncated = true;
    }

    const [queriesDetail, pagesDetail, countriesDetail, devicesDetail] = detailReports;
    const queriesNorm = normalizeDetailHourRows(queriesDetail.rows);
    const pagesNorm = normalizeDetailHourRows(pagesDetail.rows);
    const countriesNorm = normalizeDetailHourRows(countriesDetail.rows);
    const devicesNorm = normalizeDetailHourRows(devicesDetail.rows);

    const currentQueries = aggregateDetailRowsForWindow(queriesNorm, windows.current);
    const previousQueries = aggregateDetailRowsForWindow(queriesNorm, windows.previous);
    const currentPages = aggregateDetailRowsForWindow(pagesNorm, windows.current);
    const previousPages = aggregateDetailRowsForWindow(pagesNorm, windows.previous);

    currentQueryCount = currentQueries.length;
    previousQueryCount = previousQueries.length;
    currentPageCount = currentPages.length;
    previousPageCount = previousPages.length;

    queryRows = attachHref(enrichAggregatedRows(currentQueries, previousQueries), 'query');
    pageRows = attachHref(enrichAggregatedRows(currentPages, previousPages), 'page');
    countryRows = attachHref(
      enrichAggregatedRows(
        aggregateDetailRowsForWindow(countriesNorm, windows.current),
        aggregateDetailRowsForWindow(countriesNorm, windows.previous)
      ).map((row) => ({ ...row, key: countryName(row.key), rawKey: row.rawKey })),
      'country'
    );
    deviceRows = attachHref(
      enrichAggregatedRows(
        aggregateDetailRowsForWindow(devicesNorm, windows.current),
        aggregateDetailRowsForWindow(devicesNorm, windows.previous)
      ).map((row) => ({ ...row, key: formatDeviceName(row.key), rawKey: row.rawKey })),
      'device'
    );
    newRankings = attachHref(
      enrichAggregatedRows(currentQueries, previousQueries)
        .filter((row) => row.previousImpressions === 0 && row.impressions > 0)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 50),
      'query'
    );

    diagnostics = {
      siteUrl: property.siteUrl,
      searchType,
      aggregationType,
      responseAggregationType,
      activeFilters,
      dataState: apiDataState,
      dimensions: apiDimensions,
      currentWindowStart,
      currentWindowEnd,
      previousWindowStart,
      previousWindowEnd,
      latestAvailableHour,
      firstIncompleteHour,
      fetchedAt: fetchedAt.toISOString(),
      hourlyRowCount,
      totals: totalsCurrent,
    };
  } else {
    const endDate = normalizeGscDate(
      period.mode === 'custom' ? period.endDate : undefined,
      gscCalendarDate()
    );
    const startDate =
      period.mode === 'custom' ? normalizeGscDate(period.startDate, endDate) : undefined;
    const days = period.mode === 'daily' ? period.days : 28;
    const range = buildDateRange(days, endDate, startDate);
    dailyStart = range.startDate;
    dailyEnd = range.endDate;

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
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.startDate,
          endDate: range.endDate,
          dimensions: ['date'],
          rowLimit: 400,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.previousStartDate,
          endDate: range.previousEndDate,
          dimensions: ['date'],
          rowLimit: 400,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.startDate,
          endDate: range.endDate,
          dimensions: ['page'],
          rowLimit: 250,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.previousStartDate,
          endDate: range.previousEndDate,
          dimensions: ['page'],
          rowLimit: 250,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.startDate,
          endDate: range.endDate,
          dimensions: ['query'],
          rowLimit: 250,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.previousStartDate,
          endDate: range.previousEndDate,
          dimensions: ['query'],
          rowLimit: 250,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.startDate,
          endDate: range.endDate,
          dimensions: ['device'],
          rowLimit: 20,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.previousStartDate,
          endDate: range.previousEndDate,
          dimensions: ['device'],
          rowLimit: 20,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.startDate,
          endDate: range.endDate,
          dimensions: ['country'],
          rowLimit: 100,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.previousStartDate,
          endDate: range.previousEndDate,
          dimensions: ['country'],
          rowLimit: 100,
          searchType,
          filters: activeFilters,
        })
      ),
      safeQuery(
        property.connectionId,
        property.siteUrl,
        buildDailyRequest({
          startDate: range.startDate,
          endDate: range.endDate,
          dimensions: ['date', 'query'],
          rowLimit: 25000,
          searchType,
          filters: activeFilters,
        })
      ),
    ]);

    errors = [
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

    firstIncompleteKey = dailyCurrent.firstIncompleteDate || null;
    const alignedCurrentDates = enumerateDates(range.startDate, range.endDate);
    const alignedPreviousDates = enumerateDates(range.previousStartDate, range.previousEndDate);
    const alignedDailyCurrent = alignDailyRows(alignedCurrentDates, dailyCurrent.rows);
    const alignedDailyPrevious = alignDailyRows(alignedPreviousDates, dailyPrevious.rows);
    currentPoints = dailyToPoints(alignedDailyCurrent);
    previousPoints = dailyToPoints(alignedDailyPrevious);
    totalsCurrent = summarizeMetricRows(alignedDailyCurrent);
    totalsPrevious = summarizeMetricRows(alignedDailyPrevious);
    bucketLabels = alignedCurrentDates;
    bucketSeries = buildBucketSeries(queryCountDaily.rows, alignedCurrentDates);

    pageRows = attachHref(enrichRows(pagesCurrent.rows, pagesPrevious.rows), 'page');
    queryRows = attachHref(enrichRows(queriesCurrent.rows, queriesPrevious.rows), 'query');
    currentQueryCount = queriesCurrent.rows.length;
    previousQueryCount = queriesPrevious.rows.length;
    currentPageCount = pagesCurrent.rows.length;
    previousPageCount = pagesPrevious.rows.length;
    deviceRows = attachHref(
      enrichRows(devicesCurrent.rows, devicesPrevious.rows).map((row) => ({
        ...row,
        key: formatDeviceName(row.key),
        rawKey: row.rawKey,
      })),
      'device'
    );
    countryRows = attachHref(
      enrichRows(countriesCurrent.rows, countriesPrevious.rows).map((row) => ({
        ...row,
        key: countryName(row.key),
        rawKey: row.rawKey,
      })),
      'country'
    );
    newRankings = attachHref(
      enrichRows(queriesCurrent.rows, queriesPrevious.rows)
        .filter((row) => row.previousImpressions === 0 && row.impressions > 0)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 50),
      'query'
    );

    diagnostics = {
      siteUrl: property.siteUrl,
      searchType,
      aggregationType: null,
      responseAggregationType: dailyCurrent.responseAggregationType || null,
      activeFilters,
      dataState: 'all',
      dimensions: ['date'],
      currentWindowStart: range.startDate,
      currentWindowEnd: range.endDate,
      previousWindowStart: range.previousStartDate,
      previousWindowEnd: range.previousEndDate,
      latestAvailableHour: null,
      firstIncompleteHour: null,
      fetchedAt: fetchedAt.toISOString(),
      hourlyRowCount: 0,
      totals: totalsCurrent,
    };
  }

  const clicksDelta = metricDelta(totalsCurrent.clicks, totalsPrevious.clicks);
  const impressionsDelta = metricDelta(totalsCurrent.impressions, totalsPrevious.impressions);
  const positionShift = positionImprovement(totalsCurrent.position, totalsPrevious.position);

  const chartCards = [
    {
      key: 'clicks' as const,
      label: 'Клики',
      color: '#2563eb',
      valueText: formatNumber(totalsCurrent.clicks),
      changeText: formatTrend(clicksDelta.deltaPct),
      changeClass: trendClass(clicksDelta.deltaPct),
    },
    {
      key: 'impressions' as const,
      label: 'Показы',
      color: '#7c3aed',
      valueText: formatNumber(totalsCurrent.impressions),
      changeText: formatTrend(impressionsDelta.deltaPct),
      changeClass: trendClass(impressionsDelta.deltaPct),
    },
    {
      key: 'position' as const,
      label: 'Средняя позиция',
      color: '#ea580c',
      valueText: formatDecimal(totalsCurrent.position, 1),
      changeText: formatPositionShift(totalsCurrent.position, totalsPrevious.position),
      changeClass: trendClass(positionShift),
    },
  ];

  const queryCountDelta = currentQueryCount - previousQueryCount;
  const pageCountDelta = currentPageCount - previousPageCount;

  const overviewCards = [
    {
      label: 'Запросы в выдаче',
      current: formatNumber(currentQueryCount),
      change: compare ? formatCountDelta(queryCountDelta, 'query', 'queries') : '',
      changeClass: countDeltaClass(queryCountDelta),
    },
    {
      label: 'Страницы в выдаче',
      current: formatNumber(currentPageCount),
      change: compare ? formatCountDelta(pageCountDelta, 'page', 'pages') : '',
      changeClass: countDeltaClass(pageCountDelta),
    },
    {
      label: 'Страны',
      current: formatNumber(countryRows.length),
      change: compare
        ? formatTrend(
            metricDelta(sum(countryRows, (row) => row.clicks), sum(countryRows, (row) => row.previousClicks))
              .deltaPct
          )
        : '',
      changeClass: trendClass(
        metricDelta(sum(countryRows, (row) => row.clicks), sum(countryRows, (row) => row.previousClicks)).deltaPct
      ),
    },
    {
      label: 'Устройства',
      current: formatNumber(deviceRows.length),
      change: `${formatDecimal(
        weightedAverage(
          deviceRows,
          (row) => row.position,
          (row) => row.impressions
        ),
        1
      )} ср. поз.`,
      changeClass: 'good',
    },
  ];

  const filterChipData = [
    activeFilters.query
      ? { label: 'Запрос', value: activeFilters.query, href: siteHref(id, baseParams, { query: undefined }) }
      : null,
    activeFilters.page
      ? { label: 'Страница', value: activeFilters.page, href: siteHref(id, baseParams, { page: undefined }) }
      : null,
    activeFilters.country
      ? {
          label: 'Страна',
          value: countryName(activeFilters.country),
          href: siteHref(id, baseParams, { country: undefined }),
        }
      : null,
    activeFilters.device
      ? {
          label: 'Устройство',
          value: formatDeviceName(activeFilters.device),
          href: siteHref(id, baseParams, { device: undefined }),
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; href: string }>;

  const clearFiltersHref = siteHref(id, baseParams, {
    query: undefined,
    page: undefined,
    country: undefined,
    device: undefined,
  });

  const updatedLabel = hoursAgoLabel(latestAvailableHour, fetchedAt);

  return (
    <main className="page-shell site-shell">
      <section className="panel site-hero-panel">
        <div className="site-hero-head">
          <div>
            <div className="badge">Рабочая область сайта</div>
            <h1>{property.label || property.siteUrl}</h1>
            <p className="muted">{property.siteUrl}</p>
            <p className="muted">Подключённый аккаунт Google: {property.connection.email}</p>
          </div>
          <div className="header-actions">
            <Link
              className="button ghost small"
              href={`/dashboard?period=${period.id === 'custom' ? '28d' : period.id}&searchType=${searchType}`}
              prefetch
            >
              Назад к панели
            </Link>
          </div>
        </div>

        <div className="site-top-cards">
          {overviewCards.map((card) => (
            <div key={card.label} className="site-top-card">
              <span>{card.label}</span>
              <strong>{card.current}</strong>
              {card.change ? <em className={card.changeClass}>{card.change}</em> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="panel site-detail-panel site-controls-panel">
        <SiteControls
          currentPeriodId={period.id}
          currentSearchType={searchType}
          currentStartDate={period.mode === 'custom' ? period.startDate : undefined}
          currentEndDate={period.mode === 'custom' ? period.endDate : undefined}
          compare={compare}
          isCustom={period.mode === 'custom'}
          clearFiltersHref={clearFiltersHref}
        />
        <PeriodFreshness
          mode={period.mode === 'hourly' ? 'hourly' : period.mode === 'custom' ? 'custom' : 'daily'}
          currentStart={currentWindowStart}
          currentEnd={currentWindowEnd}
          latestAvailableHour={latestAvailableHour}
          firstIncompleteHour={firstIncompleteHour}
          dailyStart={dailyStart}
          dailyEnd={dailyEnd}
          updatedLabel={updatedLabel}
        />
      </section>

      <SiteFilterBar filters={filterChipData} clearHref={clearFiltersHref} />

      {errors.length > 0 ? (
        <div className="alert error">
          Часть отчётов для этого сайта не загрузилась. Если ресурс недавно удалили в Search Console, нажмите
          «Обновить сайты» у подключения на панели — устаревшие ресурсы исчезнут из базы приложения.
        </div>
      ) : null}

      {detailTruncated ? (
        <div className="alert warning subtle-warning">
          Детальные таблицы могут быть усечены из‑за лимита строк API. Сводные клики и показы посчитаны по
          отдельному почасовому totals-запросу и не зависят от этих таблиц.
        </div>
      ) : null}

      <section className="panel site-detail-panel">
        <SiteTrendChart
          mode={chartMode}
          currentPoints={currentPoints}
          previousPoints={compare ? previousPoints : []}
          compare={compare}
          firstIncompleteKey={firstIncompleteKey}
          cards={chartCards}
        />
      </section>

      <section className="grid two-columns site-grid-gap">
        <WorkspaceTable title="Запросы" rows={queryRows} keyLabel="Запрос" />
        <WorkspaceTable title="Страницы" rows={pageRows} keyLabel="Страница" />
      </section>

      <section className="grid two-columns site-grid-gap">
        {hideQueryCounting ? (
          <div className="panel site-detail-panel">
            <h3>Число запросов</h3>
            <p className="muted">
              В режиме «24 часа» дневной график числа запросов скрыт: для него нужна почасовая серия hour+query,
              которая может быть усечена лимитом API. Используйте таблицу «Запросы» ниже.
            </p>
          </div>
        ) : bucketSeries ? (
          <QueryCountingChart
            labels={bucketLabels.map((item) =>
              new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(
                new Date(`${item}T12:00:00`)
              )
            )}
            series={bucketSeries}
          />
        ) : null}
        <WorkspaceTable title="Страны" rows={countryRows} keyLabel="Страна" />
      </section>

      <section className="grid two-columns site-grid-gap">
        <WorkspaceTable title="Новые позиции" rows={newRankings} keyLabel="Запрос" />
        <WorkspaceTable title="Устройства" rows={deviceRows} keyLabel="Устройство" />
      </section>

      {diagnostics ? <DataDiagnostics data={diagnostics} /> : null}
    </main>
  );
}
