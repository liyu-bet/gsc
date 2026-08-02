import { parseAllowedRange, type AllowedRangeDays } from './date-ranges';

export const PERIOD_PRESETS = [
  { id: '24h', label: '24 часа', kind: 'hourly' as const },
  { id: '7d', label: '7 дней', kind: 'daily' as const, days: 7 as AllowedRangeDays },
  { id: '28d', label: '28 дней', kind: 'daily' as const, days: 28 as AllowedRangeDays },
  { id: '90d', label: '3 месяца', kind: 'daily' as const, days: 90 as AllowedRangeDays },
  { id: '180d', label: '6 месяцев', kind: 'daily' as const, days: 180 as AllowedRangeDays },
  { id: '365d', label: '1 год', kind: 'daily' as const, days: 365 as AllowedRangeDays },
  { id: '730d', label: '2 года', kind: 'daily' as const, days: 730 as AllowedRangeDays },
  { id: 'custom', label: 'Свой период', kind: 'custom' as const },
] as const;

export type PeriodId = (typeof PERIOD_PRESETS)[number]['id'];

export type ResolvedPeriod =
  | { id: '24h'; mode: 'hourly'; compareDefault: false }
  | { id: string; mode: 'daily'; days: AllowedRangeDays; compareDefault: true }
  | { id: 'custom'; mode: 'custom'; compareDefault: true };

const DAYS_BY_PERIOD: Record<string, AllowedRangeDays> = {
  '7d': 7,
  '14d': 14,
  '28d': 28,
  '90d': 90,
  '180d': 180,
  '365d': 365,
  '730d': 730,
};

const PERIOD_BY_DAYS: Partial<Record<AllowedRangeDays, string>> = {
  7: '7d',
  14: '14d',
  28: '28d',
  90: '90d',
  180: '180d',
  365: '365d',
  730: '730d',
};

export function periodLabel(id: string): string {
  return PERIOD_PRESETS.find((item) => item.id === id)?.label || id;
}

export function parsePeriodParams(input: {
  period?: string;
  range?: string;
  startDate?: string;
  endDate?: string;
}): ResolvedPeriod {
  const periodRaw = (input.period || '').trim().toLowerCase();
  const hasCustomDates = Boolean(input.startDate && input.endDate);

  if (periodRaw === 'custom' || (hasCustomDates && (periodRaw === 'custom' || periodRaw === ''))) {
    // Custom only when explicitly selected or both dates present without an hourly/daily period override.
    if (periodRaw === 'custom' || (!periodRaw && hasCustomDates)) {
      return { id: 'custom', mode: 'custom', compareDefault: true };
    }
  }

  if (periodRaw === '24h' || periodRaw === '1d') {
    return { id: '24h', mode: 'hourly', compareDefault: false };
  }

  if (periodRaw && DAYS_BY_PERIOD[periodRaw]) {
    return {
      id: periodRaw,
      mode: 'daily',
      days: DAYS_BY_PERIOD[periodRaw],
      compareDefault: true,
    };
  }

  // Legacy ?range=1 → rolling 24h (not a Pacific calendar day).
  if (!periodRaw && (input.range === '1' || input.range === '1d')) {
    return { id: '24h', mode: 'hourly', compareDefault: false };
  }

  if (!periodRaw && input.range) {
    const days = parseAllowedRange(input.range, 28);
    if (days === 1) {
      return { id: '24h', mode: 'hourly', compareDefault: false };
    }
    return {
      id: PERIOD_BY_DAYS[days] || `${days}d`,
      mode: 'daily',
      days,
      compareDefault: true,
    };
  }

  // Default when no period/range: 28 days.
  return { id: '28d', mode: 'daily', days: 28, compareDefault: true };
}

/** Canonical query params for a period selection (drops date fields for presets). */
export function periodToQueryParams(
  period: ResolvedPeriod,
  extras?: { startDate?: string; endDate?: string }
): Record<string, string | undefined> {
  if (period.mode === 'hourly') {
    return {
      period: '24h',
      range: undefined,
      startDate: undefined,
      endDate: undefined,
    };
  }

  if (period.mode === 'custom') {
    return {
      period: 'custom',
      range: undefined,
      startDate: extras?.startDate,
      endDate: extras?.endDate,
    };
  }

  return {
    period: period.id,
    range: undefined,
    startDate: undefined,
    endDate: undefined,
  };
}

export function isHourlyPeriod(period: ResolvedPeriod): period is Extract<ResolvedPeriod, { mode: 'hourly' }> {
  return period.mode === 'hourly';
}
