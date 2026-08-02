export const ALLOWED_RANGE_DAYS = [1, 7, 14, 28, 90, 180, 365, 730] as const;

export type AllowedRangeDays = (typeof ALLOWED_RANGE_DAYS)[number];

export type ComparisonDateRange = {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
};

const ALLOWED_RANGE_SET = new Set<number>(ALLOWED_RANGE_DAYS);
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const PACIFIC_TZ = 'America/Los_Angeles';

function isAllowedRangeDays(value: number): value is AllowedRangeDays {
  return ALLOWED_RANGE_SET.has(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseYmdParts(ymd: string): { year: number; month: number; day: number } | null {
  if (!YMD_RE.test(ymd)) return null;
  const [yearRaw, monthRaw, dayRaw] = ymd.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Validate calendar day via UTC noon to avoid DST edge cases.
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addCalendarDays(ymd: string, deltaDays: number): string {
  const parts = parseYmdParts(ymd);
  if (!parts) {
    throw new Error(`Invalid GSC date: ${ymd}`);
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return formatYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function parseAllowedRange(
  raw: string | number | undefined,
  fallback: AllowedRangeDays = 90
): AllowedRangeDays {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(parsed)) return fallback;
  return isAllowedRangeDays(parsed) ? parsed : fallback;
}

export function gscCalendarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to format GSC calendar date in America/Los_Angeles');
  }

  return `${year}-${month}-${day}`;
}

export function normalizeGscDate(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  return parseYmdParts(trimmed) ? trimmed : fallback;
}

export function buildComparisonRange(days: AllowedRangeDays, endDate: string): ComparisonDateRange {
  const normalizedEnd = normalizeGscDate(endDate, endDate);
  if (!parseYmdParts(normalizedEnd)) {
    throw new Error(`Invalid endDate for comparison range: ${endDate}`);
  }

  const startDate = addCalendarDays(normalizedEnd, -(days - 1));
  const previousEndDate = addCalendarDays(startDate, -1);
  const previousStartDate = addCalendarDays(previousEndDate, -(days - 1));

  return {
    startDate,
    endDate: normalizedEnd,
    previousStartDate,
    previousEndDate,
  };
}

export function enumerateDates(startDate: string, endDate: string): string[] {
  if (!parseYmdParts(startDate) || !parseYmdParts(endDate)) {
    throw new Error(`Invalid date bounds: ${startDate} → ${endDate}`);
  }

  const dates: string[] = [];
  let cursor = startDate;
  // Guard against inverted ranges.
  if (cursor > endDate) return dates;

  while (true) {
    dates.push(cursor);
    if (cursor === endDate) break;
    cursor = addCalendarDays(cursor, 1);
    if (dates.length > 5000) {
      throw new Error('enumerateDates exceeded safety limit');
    }
  }

  return dates;
}

export function buildCustomComparisonRange(
  startDate: string,
  endDate: string
): ComparisonDateRange | null {
  const start = normalizeGscDate(startDate, '');
  const end = normalizeGscDate(endDate, '');
  if (!start || !end || !parseYmdParts(start) || !parseYmdParts(end) || start > end) {
    return null;
  }

  const span = enumerateDates(start, end).length;
  const previousEndDate = addCalendarDays(start, -1);
  const previousStartDate = addCalendarDays(previousEndDate, -(span - 1));

  return {
    startDate: start,
    endDate: end,
    previousStartDate,
    previousEndDate,
  };
}

export function differenceInCalendarDaysInclusive(startDate: string, endDate: string): number {
  return enumerateDates(startDate, endDate).length;
}
