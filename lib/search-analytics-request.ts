import type { SearchAnalyticsDataState } from './google';

export type ActiveDimensionFilters = {
  query?: string;
  page?: string;
  country?: string;
  device?: string;
};

export type SearchAnalyticsRequestBody = {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit: number;
  dataState: SearchAnalyticsDataState;
  aggregationType?: 'auto' | 'byPage' | 'byProperty';
  type?: string;
  startRow?: number;
  dimensionFilterGroups?: Array<{
    groupType: 'and';
    filters: Array<{ dimension: string; expression: string; operator: 'equals' }>;
  }>;
};

export function buildFilterGroups(filters: ActiveDimensionFilters) {
  const items = [] as Array<{ dimension: string; expression: string; operator: 'equals' }>;
  if (filters.query) items.push({ dimension: 'query', expression: filters.query, operator: 'equals' });
  if (filters.page) items.push({ dimension: 'page', expression: filters.page, operator: 'equals' });
  if (filters.country) items.push({ dimension: 'country', expression: filters.country, operator: 'equals' });
  if (filters.device) items.push({ dimension: 'device', expression: filters.device, operator: 'equals' });
  return items.length ? [{ groupType: 'and' as const, filters: items }] : undefined;
}

export function buildDailyRequest(input: {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit: number;
  searchType: string;
  filters?: ActiveDimensionFilters;
  startRow?: number;
}): SearchAnalyticsRequestBody {
  const filters = input.filters || {};
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions: input.dimensions,
    rowLimit: input.rowLimit,
    dataState: 'all',
    ...(input.searchType !== 'web' ? { type: input.searchType } : {}),
    ...(input.startRow ? { startRow: input.startRow } : {}),
    ...(buildFilterGroups(filters) ? { dimensionFilterGroups: buildFilterGroups(filters) } : {}),
  };
}

/** Totals / property-level hourly series for rolling 24h mode. */
export function buildHourlyTotalsRequest(input: {
  startDate: string;
  endDate: string;
  searchType: string;
  filters?: ActiveDimensionFilters;
  rowLimit?: number;
}): SearchAnalyticsRequestBody {
  const filters = input.filters || {};
  const aggregationType = filters.page ? 'auto' : 'byProperty';
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions: ['hour'],
    rowLimit: input.rowLimit ?? 250,
    dataState: 'hourly_all',
    aggregationType,
    ...(input.searchType !== 'web' ? { type: input.searchType } : {}),
    ...(buildFilterGroups(filters) ? { dimensionFilterGroups: buildFilterGroups(filters) } : {}),
  };
}

/** Detail hourly report: hour + secondary dimension. */
export function buildHourlyDetailRequest(input: {
  startDate: string;
  endDate: string;
  secondaryDimension: 'query' | 'page' | 'country' | 'device';
  searchType: string;
  filters?: ActiveDimensionFilters;
  rowLimit?: number;
  startRow?: number;
}): SearchAnalyticsRequestBody {
  const filters = input.filters || {};
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions: ['hour', input.secondaryDimension],
    rowLimit: input.rowLimit ?? 25000,
    dataState: 'hourly_all',
    ...(input.searchType !== 'web' ? { type: input.searchType } : {}),
    ...(input.startRow ? { startRow: input.startRow } : {}),
    ...(buildFilterGroups(filters) ? { dimensionFilterGroups: buildFilterGroups(filters) } : {}),
  };
}
