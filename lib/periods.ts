import { normalizeGscDate, parseAllowedRange, type AllowedRangeDays } from './date-ranges';

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
  | { id: 'custom'; mode: 'custom'; compareDefault: true; startDate: string; endDate: string };

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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function periodLabel(id: string): string {
  return PERIOD_PRESETS.find((item) => item.id === id)?.label || id;
}

export function isValidYmd(value: string | undefined): value is string {
  if (!value || !YMD_RE.test(value.trim())) return false;
  return normalizeGscDate(value.trim(), '') === value.trim();
}

/** Valid custom range: both dates valid and start <= end. */
export function parseValidCustomDates(
  startDate: string | undefined,
  endDate: string | undefined
): { startDate: string; endDate: string } | null {
  if (!isValidYmd(startDate) || !isValidYmd(endDate)) return null;
  if (startDate > endDate) return null;
  return { startDate, endDate };
}

export function isValidCustomDateRange(
  startDate: string | undefined,
  endDate: string | undefined
): boolean {
  return parseValidCustomDates(startDate, endDate) !== null;
}

export function customPeriodValidationError(
  startDate: string | undefined,
  endDate: string | undefined
): string | null {
  if (!startDate || !endDate) return null;
  if (!isValidYmd(startDate) || !isValidYmd(endDate)) return null;
  if (startDate > endDate) return 'Дата начала не может быть позже даты окончания';
  return null;
}

export function canApplyCustomPeriod(startDate: string | undefined, endDate: string | undefined): boolean {
  return isValidCustomDateRange(startDate, endDate);
}

/** Opening the custom panel must not mutate the URL by itself. */
export function shouldUpdateUrlOnCustomOpen(): boolean {
  return false;
}

export function buildCustomApplyParams(startDate: string, endDate: string) {
  return {
    period: 'custom' as const,
    range: undefined as string | undefined,
    startDate,
    endDate,
  };
}

function defaultDaily(): ResolvedPeriod {
  return { id: '28d', mode: 'daily', days: 28, compareDefault: true };
}

export function parsePeriodParams(input: {
  period?: string;
  range?: string;
  startDate?: string;
  endDate?: string;
}): ResolvedPeriod {
  const periodRaw = (input.period || '').trim().toLowerCase();

  if (periodRaw === 'custom') {
    const custom = parseValidCustomDates(input.startDate, input.endDate);
    if (custom) {
      return {
        id: 'custom',
        mode: 'custom',
        compareDefault: true,
        startDate: custom.startDate,
        endDate: custom.endDate,
      };
    }
    // Incomplete/invalid custom URL → safe fallback.
    return defaultDaily();
  }

  // Both dates without an explicit period → custom when valid.
  if (!periodRaw) {
    const custom = parseValidCustomDates(input.startDate, input.endDate);
    if (custom) {
      return {
        id: 'custom',
        mode: 'custom',
        compareDefault: true,
        startDate: custom.startDate,
        endDate: custom.endDate,
      };
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

  return defaultDaily();
}

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
      startDate: extras?.startDate ?? period.startDate,
      endDate: extras?.endDate ?? period.endDate,
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
