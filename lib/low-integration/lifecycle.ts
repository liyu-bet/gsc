import { z } from 'zod';
import { latestAvailableDate, querySite } from '@/lib/google';
import type { LowLifecycleResponse } from './types';

const DEFAULT_LOOKBACK_DAYS = 488;
const DEFAULT_WINDOW_DAYS = 90;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_WINDOWS = 64;

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const searchAnalyticsRowSchema = z.object({
  keys: z.array(z.string()).optional(),
  clicks: z.number().optional(),
  impressions: z.number().optional(),
  ctr: z.number().optional(),
  position: z.number().optional(),
});

const searchAnalyticsResponseSchema = z.object({
  rows: z.array(searchAnalyticsRowSchema).optional(),
});

export type DailyMetricRow = {
  date: string;
  impressions: number;
  clicks: number;
};

export function getLifecycleLookbackDays(): number {
  const raw = process.env.GSC_LIFECYCLE_LOOKBACK_DAYS?.trim();
  if (!raw) return DEFAULT_LOOKBACK_DAYS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2000) return DEFAULT_LOOKBACK_DAYS;
  return parsed;
}

export function getLifecycleTimeoutMs(): number {
  const raw = process.env.GSC_LIFECYCLE_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 300_000) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

export function getLifecycleWindowDays(): number {
  const raw = process.env.GSC_LIFECYCLE_WINDOW_DAYS?.trim();
  if (!raw) return DEFAULT_WINDOW_DAYS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 366) return DEFAULT_WINDOW_DAYS;
  return parsed;
}

/** Calendar-date arithmetic in UTC — avoids local timezone day shifts. */
export function addUtcDays(ymd: string, days: number): string {
  const parsed = ymdSchema.safeParse(ymd);
  if (!parsed.success) {
    throw new Error('Invalid calendar date');
  }
  const [y, m, d] = parsed.data.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function buildLifecycleSearchRange(lookbackDays = getLifecycleLookbackDays()): {
  searchedFrom: string;
  searchedTo: string;
} {
  const searchedTo = latestAvailableDate();
  const searchedFrom = addUtcDays(searchedTo, -(lookbackDays - 1));
  return { searchedFrom, searchedTo };
}

export function enumerateDateWindows(
  from: string,
  to: string,
  windowDays: number
): Array<{ startDate: string; endDate: string }> {
  if (from > to) return [];
  const windows: Array<{ startDate: string; endDate: string }> = [];
  let cursor = from;
  let guard = 0;

  while (cursor <= to) {
    guard += 1;
    if (guard > MAX_WINDOWS) {
      throw new Error('Lifecycle window limit exceeded');
    }
    const tentativeEnd = addUtcDays(cursor, windowDays - 1);
    const endDate = tentativeEnd < to ? tentativeEnd : to;
    windows.push({ startDate: cursor, endDate });
    if (endDate >= to) break;
    cursor = addUtcDays(endDate, 1);
  }

  return windows;
}

export function isYmdInInclusiveRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export function parseSearchAnalyticsDateRows(
  payload: unknown,
  bounds?: { from: string; to: string }
): DailyMetricRow[] {
  const parsed = searchAnalyticsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('Invalid Search Console API response');
  }

  const rows: DailyMetricRow[] = [];
  for (const row of parsed.data.rows ?? []) {
    const date = row.keys?.[0];
    if (!date || !ymdSchema.safeParse(date).success) continue;
    if (bounds && !isYmdInInclusiveRange(date, bounds.from, bounds.to)) continue;
    rows.push({
      date,
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

/** Keep only dates inside the executed search range; out-of-range → null. */
export function clampLifecycleDate(
  date: string | null,
  searchedFrom: string,
  searchedTo: string
): string | null {
  if (date === null) return null;
  if (!ymdSchema.safeParse(date).success) return null;
  if (!isYmdInInclusiveRange(date, searchedFrom, searchedTo)) return null;
  return date;
}

/**
 * Earliest calendar dates among API rows with impressions/clicks > 0.
 * Missing days (no row) are not treated as zero-data days.
 */
export function findEarliestImpressionAndClickDates(rows: DailyMetricRow[]): {
  firstImpressionDate: string | null;
  firstClickDate: string | null;
} {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  let firstImpressionDate: string | null = null;
  let firstClickDate: string | null = null;

  for (const row of sorted) {
    if (firstImpressionDate === null && row.impressions > 0) {
      firstImpressionDate = row.date;
    }
    if (firstClickDate === null && row.clicks > 0) {
      firstClickDate = row.date;
    }
    if (firstImpressionDate !== null && firstClickDate !== null) break;
  }

  return { firstImpressionDate, firstClickDate };
}

export function mergeEarliestDates(
  current: { firstImpressionDate: string | null; firstClickDate: string | null },
  next: { firstImpressionDate: string | null; firstClickDate: string | null }
): { firstImpressionDate: string | null; firstClickDate: string | null } {
  return {
    firstImpressionDate:
      current.firstImpressionDate === null
        ? next.firstImpressionDate
        : next.firstImpressionDate === null
          ? current.firstImpressionDate
          : current.firstImpressionDate < next.firstImpressionDate
            ? current.firstImpressionDate
            : next.firstImpressionDate,
    firstClickDate:
      current.firstClickDate === null
        ? next.firstClickDate
        : next.firstClickDate === null
          ? current.firstClickDate
          : current.firstClickDate < next.firstClickDate
            ? current.firstClickDate
            : next.firstClickDate,
  };
}

export type LifecycleQueryFn = (
  connectionId: string,
  siteUrl: string,
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal }
) => Promise<unknown>;

export async function calculatePropertyLifecycle(input: {
  propertyId: string;
  siteUrl: string;
  connectionId: string;
  queryFn?: LifecycleQueryFn;
  lookbackDays?: number;
  windowDays?: number;
  timeoutMs?: number;
  /** Override planned end date (YYYY-MM-DD) for tests. */
  searchedToOverride?: string;
}): Promise<LowLifecycleResponse> {
  const lookbackDays = input.lookbackDays ?? getLifecycleLookbackDays();
  const windowDays = input.windowDays ?? getLifecycleWindowDays();
  const timeoutMs = input.timeoutMs ?? getLifecycleTimeoutMs();
  const queryFn = input.queryFn ?? querySite;

  const plannedTo = input.searchedToOverride ?? latestAvailableDate();
  const plannedFrom = addUtcDays(plannedTo, -(lookbackDays - 1));
  const windows = enumerateDateWindows(plannedFrom, plannedTo, windowDays);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let dates = {
    firstImpressionDate: null as string | null,
    firstClickDate: null as string | null,
  };

  // Actual executed range — updated per window so early-stop does not overclaim coverage.
  let searchedFrom = plannedFrom;
  let searchedTo = plannedFrom;

  try {
    if (windows.length === 0) {
      return {
        propertyId: input.propertyId,
        siteUrl: input.siteUrl,
        firstImpressionDate: null,
        firstClickDate: null,
        searchedFrom: plannedFrom,
        searchedTo: plannedTo,
        dateMeaning: 'earliest_available_in_search_console_api',
        generatedAt: new Date().toISOString(),
      };
    }

    searchedFrom = windows[0]!.startDate;

    for (const window of windows) {
      if (controller.signal.aborted) {
        throw new Error('Lifecycle search timed out');
      }

      const raw = await queryFn(
        input.connectionId,
        input.siteUrl,
        {
          startDate: window.startDate,
          endDate: window.endDate,
          dimensions: ['date'],
          rowLimit: Math.min(windowDays + 5, 25000),
          dataState: 'all',
        },
        { signal: controller.signal }
      );

      const rows = parseSearchAnalyticsDateRows(raw, {
        from: window.startDate,
        to: window.endDate,
      });
      const found = findEarliestImpressionAndClickDates(rows);
      dates = mergeEarliestDates(dates, found);
      searchedTo = window.endDate;

      if (dates.firstImpressionDate !== null && dates.firstClickDate !== null) {
        break;
      }
    }
  } finally {
    clearTimeout(timer);
  }

  return {
    propertyId: input.propertyId,
    siteUrl: input.siteUrl,
    firstImpressionDate: clampLifecycleDate(dates.firstImpressionDate, searchedFrom, searchedTo),
    firstClickDate: clampLifecycleDate(dates.firstClickDate, searchedFrom, searchedTo),
    searchedFrom,
    searchedTo,
    dateMeaning: 'earliest_available_in_search_console_api',
    generatedAt: new Date().toISOString(),
  };
}
