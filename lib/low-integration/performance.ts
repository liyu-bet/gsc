import { z } from 'zod';
import { latestAvailableDate, querySite } from '@/lib/google';
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
 * Latest calendar day Search Console typically exposes (today − 2 local days).
 * This is NOT a rolling 24h window.
 */
export function resolveLatestAvailableDay(now = new Date()): string {
  void now;
  return latestAvailableDate();
}

export function sumSearchAnalyticsTotals(payload: unknown): {
  impressions: number;
  clicks: number;
} {
  const parsed = searchAnalyticsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('Invalid Search Console API response');
  }

  let impressions = 0;
  let clicks = 0;
  for (const row of parsed.data.rows ?? []) {
    impressions += Number(row.impressions ?? 0);
    clicks += Number(row.clicks ?? 0);
  }

  if (!Number.isFinite(impressions) || impressions < 0) impressions = 0;
  if (!Number.isFinite(clicks) || clicks < 0) clicks = 0;
  // Guard impossible click > impression ratios from bad upstream rows.
  if (clicks > impressions) clicks = impressions;

  return { impressions, clicks };
}

export async function calculatePropertyPerformance(input: {
  propertyId: string;
  siteUrl: string;
  connectionId: string;
  queryFn?: typeof querySite;
  now?: Date;
}): Promise<LowPerformanceResponse> {
  const dataDate = resolveLatestAvailableDay(input.now);
  const queryFn = input.queryFn ?? querySite;
  const timeoutMs = getPerformanceTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = await queryFn(
      input.connectionId,
      input.siteUrl,
      {
        startDate: dataDate,
        endDate: dataDate,
        rowLimit: 25_000,
        dataState: 'final',
      },
      { signal: controller.signal },
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
