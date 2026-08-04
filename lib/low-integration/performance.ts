import { z } from 'zod';
import { querySite } from '@/lib/google';
import { GoogleApiError } from '@/lib/google-errors';
import { addGscCalendarDays, gscCalendarDate } from '@/lib/date-ranges';
import type { LowPerformanceResponse } from './types';

const searchAnalyticsRowSchema = z.object({
  keys: z.array(z.string()).optional(),
  clicks: z.number().optional(),
  impressions: z.number().optional(),
});

const searchAnalyticsResponseSchema = z.object({
  rows: z.array(searchAnalyticsRowSchema).optional(),
});

const DEFAULT_TIMEOUT_MS = 60_000;

export function getPerformanceTimeoutMs(): number {
  const raw = process.env.GSC_PERFORMANCE_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 300_000) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

/**
 * Expected finalized Search Console calendar day for LOW latest_day:
 * Pacific (America/Los_Angeles) calendar date of `now`, minus 2 calendar days.
 *
 * This is a fixed lag contract — not a probe of the last day with data,
 * not rolling 24h, and not the VPS local timezone.
 */
export function resolveExpectedFinalizedGscDate(now: Date = new Date()): string {
  return addGscCalendarDays(gscCalendarDate(now), -2);
}

/** @deprecated Prefer resolveExpectedFinalizedGscDate — kept as alias for call sites. */
export function resolveLatestAvailableDay(now: Date = new Date()): string {
  return resolveExpectedFinalizedGscDate(now);
}

export function buildLatestDaySearchAnalyticsBody(dataDate: string): Record<string, unknown> {
  return {
    startDate: dataDate,
    endDate: dataDate,
    dataState: 'final',
    dimensions: [],
    rowLimit: 1,
    aggregationType: 'byProperty',
  };
}

function assertFiniteNonNegative(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new GoogleApiError({
      code: 'INVALID_RESPONSE',
      safeMessage: `Некорректное значение ${field} в ответе Search Analytics`,
      retryable: false,
    });
  }
  return value;
}

/**
 * Sum property totals from Search Analytics payload.
 * Does not clamp clicks to impressions — upstream values are preserved when valid.
 */
export function sumSearchAnalyticsTotals(payload: unknown): {
  impressions: number;
  clicks: number;
} {
  const parsed = searchAnalyticsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new GoogleApiError({
      code: 'INVALID_RESPONSE',
      safeMessage: 'Некорректный ответ Search Analytics',
      retryable: false,
    });
  }

  let impressions = 0;
  let clicks = 0;
  for (const row of parsed.data.rows ?? []) {
    if (row.impressions !== undefined) {
      impressions += assertFiniteNonNegative(row.impressions, 'impressions');
    }
    if (row.clicks !== undefined) {
      clicks += assertFiniteNonNegative(row.clicks, 'clicks');
    }
  }

  return { impressions, clicks };
}

export async function calculatePropertyPerformance(input: {
  propertyId: string;
  siteUrl: string;
  connectionId: string;
  queryFn?: typeof querySite;
  now?: Date;
}): Promise<LowPerformanceResponse> {
  const dataDate = resolveExpectedFinalizedGscDate(input.now);
  const queryFn = input.queryFn ?? querySite;
  const timeoutMs = getPerformanceTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = await queryFn(
      input.connectionId,
      input.siteUrl,
      buildLatestDaySearchAnalyticsBody(dataDate),
      { signal: controller.signal }
    );

    const totals = sumSearchAnalyticsTotals(payload);

    return {
      propertyId: input.propertyId,
      siteUrl: input.siteUrl,
      period: 'latest_available_day',
      periodStart: dataDate,
      periodEnd: dataDate,
      dataDate,
      impressions: totals.impressions,
      clicks: totals.clicks,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}
