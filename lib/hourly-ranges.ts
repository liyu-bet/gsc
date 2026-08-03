import { gscCalendarDate } from './date-ranges';
import { summarizeMetricRows, type MetricRow } from './metrics';

export type HourlyMetricRow = {
  hour: string;
  clicks: number;
  impressions: number;
  position: number | null;
};

export type HourWindow = {
  start: string;
  end: string;
  rows: HourlyMetricRow[];
};

export type HourlyWindows = {
  current: HourWindow;
  previous: HourWindow;
  latestAvailableHour: string | null;
};

export type AggregatedDimensionRow = {
  key: string;
  clicks: number;
  impressions: number;
  position: number;
};

const HOUR_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;
const PACIFIC_TZ = 'America/Los_Angeles';
const MS_PER_HOUR = 60 * 60 * 1000;

function asFiniteNumber(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseHourMs(hour: string): number | null {
  const trimmed = hour.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

export function isValidHourKey(hour: string): boolean {
  return HOUR_ISO_RE.test(hour.trim()) && parseHourMs(hour) !== null;
}

export function compareHourKeys(left: string, right: string): number {
  const leftMs = parseHourMs(left);
  const rightMs = parseHourMs(right);
  if (leftMs === null && rightMs === null) return left.localeCompare(right);
  if (leftMs === null) return 1;
  if (rightMs === null) return -1;
  return leftMs - rightMs;
}

export function normalizeHourlyRows(
  rows: Array<{ keys?: string[]; clicks?: number | null; impressions?: number | null; position?: number | null }>
): HourlyMetricRow[] {
  const byHour = new Map<string, HourlyMetricRow>();

  for (const row of rows) {
    const hour = row.keys?.[0]?.trim() || '';
    if (!isValidHourKey(hour)) continue;

    const clicks = asFiniteNumber(row.clicks);
    const impressions = asFiniteNumber(row.impressions);
    const position = row.position == null || !Number.isFinite(Number(row.position)) ? null : Number(row.position);
    const existing = byHour.get(hour);

    if (!existing) {
      byHour.set(hour, { hour, clicks, impressions, position });
      continue;
    }

    const mergedImpressions = existing.impressions + impressions;
    const mergedClicks = existing.clicks + clicks;
    let mergedPosition: number | null = existing.position;
    if (mergedImpressions > 0) {
      const leftWeight = existing.impressions > 0 && existing.position != null ? existing.position * existing.impressions : 0;
      const rightWeight = impressions > 0 && position != null ? position * impressions : 0;
      mergedPosition = (leftWeight + rightWeight) / mergedImpressions;
    } else {
      mergedPosition = null;
    }

    byHour.set(hour, {
      hour,
      clicks: mergedClicks,
      impressions: mergedImpressions,
      position: mergedPosition,
    });
  }

  return Array.from(byHour.values()).sort((a, b) => compareHourKeys(a.hour, b.hour));
}

function emptyHourRow(hour: string): HourlyMetricRow {
  return { hour, clicks: 0, impressions: 0, position: 0 };
}

/**
 * Format an absolute instant as a GSC-style Pacific hour key with the
 * actual America/Los_Angeles offset at that instant (handles PST/PDT).
 */
export function formatPacificHourKey(targetMs: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(targetMs));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const tzName = get('timeZoneName'); // e.g. GMT-07:00 / GMT-08:00 / UTC
  let offset = 'Z';
  if (tzName.startsWith('GMT') && tzName.length > 3) {
    offset = tzName.slice(3); // -07:00
  } else if (tzName === 'UTC' || tzName === 'GMT') {
    offset = 'Z';
  }

  return `${year}-${month}-${day}T${hour}:00:00${offset === 'Z' ? 'Z' : offset}`;
}

/** @deprecated Prefer formatPacificHourKey; kept for call-site compatibility. */
export function synthesizeHourKey(_templateHour: string, targetMs: number): string {
  return formatPacificHourKey(targetMs);
}

function findHourKeyAtMs(rowsByHour: Map<string, HourlyMetricRow>, targetMs: number): string | null {
  for (const key of rowsByHour.keys()) {
    if (parseHourMs(key) === targetMs) return key;
  }
  return null;
}

/**
 * Build a continuous hour scale ending at `anchorHour` (inclusive),
 * length = `hours`. Missing hours are zero-filled with DST-correct Pacific keys.
 */
export function buildFilledHourWindow(
  rowsByHour: Map<string, HourlyMetricRow>,
  anchorHour: string,
  hours: number
): HourWindow {
  const anchorMs = parseHourMs(anchorHour);
  if (anchorMs === null || hours <= 0) {
    return { start: anchorHour, end: anchorHour, rows: [] };
  }

  const rows: HourlyMetricRow[] = [];
  for (let offset = hours - 1; offset >= 0; offset -= 1) {
    const targetMs = anchorMs - offset * MS_PER_HOUR;
    const existingKey = findHourKeyAtMs(rowsByHour, targetMs);
    const hourKey = existingKey || formatPacificHourKey(targetMs);
    rows.push(rowsByHour.get(hourKey) || emptyHourRow(hourKey));
  }

  return {
    start: rows[0]?.hour || anchorHour,
    end: rows[rows.length - 1]?.hour || anchorHour,
    rows,
  };
}

export function findLatestAvailableHour(rows: HourlyMetricRow[]): string | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => compareHourKeys(a.hour, b.hour));
  return sorted[sorted.length - 1]?.hour || null;
}

/**
 * Build current/previous windows ending at a fixed anchor (inclusive).
 * Does not pick its own latest hour from the rows.
 */
export function buildHourlyWindowsAtAnchor(
  rows: HourlyMetricRow[],
  anchorHour: string,
  hours = 24
): HourlyWindows {
  const anchorMs = parseHourMs(anchorHour);
  if (anchorMs === null || hours <= 0) {
    const empty: HourWindow = { start: '', end: '', rows: [] };
    return { current: empty, previous: empty, latestAvailableHour: null };
  }

  const rowsByHour = new Map(rows.map((row) => [row.hour, row]));
  const current = buildFilledHourWindow(rowsByHour, anchorHour, hours);
  const previousAnchorMs = anchorMs - hours * MS_PER_HOUR;
  const previousAnchorExisting =
    findHourKeyAtMs(rowsByHour, previousAnchorMs) || formatPacificHourKey(previousAnchorMs);
  const previous = buildFilledHourWindow(rowsByHour, previousAnchorExisting, hours);

  return {
    current,
    previous,
    latestAvailableHour: anchorHour,
  };
}

/**
 * Choose the earliest (minimum) latestAvailableHour among sites.
 * Returns null when no valid hours are provided.
 */
export function chooseCommonHourlyAnchor(latestHours: Array<string | null | undefined>): string | null {
  const valid = latestHours.filter((hour): hour is string => Boolean(hour && parseHourMs(hour) !== null));
  if (!valid.length) return null;
  return [...valid].sort(compareHourKeys)[0] || null;
}

export function buildLatestHourlyWindows(rows: HourlyMetricRow[], hours = 24): HourlyWindows {
  const normalized = [...rows].sort((a, b) => compareHourKeys(a.hour, b.hour));
  const latestAvailableHour = findLatestAvailableHour(normalized);
  if (!latestAvailableHour) {
    const empty: HourWindow = { start: '', end: '', rows: [] };
    return { current: empty, previous: empty, latestAvailableHour: null };
  }
  return buildHourlyWindowsAtAnchor(normalized, latestAvailableHour, hours);
}

export function hourInWindow(hour: string, window: HourWindow): boolean {
  if (!window.rows.length) return false;
  const ms = parseHourMs(hour);
  const startMs = parseHourMs(window.start);
  const endMs = parseHourMs(window.end);
  if (ms === null || startMs === null || endMs === null) return false;
  return ms >= startMs && ms <= endMs;
}

export function summarizeHourWindow(window: HourWindow) {
  return summarizeMetricRows(
    window.rows.map((row) => ({
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position ?? 0,
    }))
  );
}

export type DetailHourRow = {
  hour: string;
  key: string;
  clicks: number;
  impressions: number;
  position: number | null;
};

export function normalizeDetailHourRows(
  rows: Array<{ keys?: string[]; clicks?: number | null; impressions?: number | null; position?: number | null }>,
  hourIndex = 0,
  keyIndex = 1
): DetailHourRow[] {
  const result: DetailHourRow[] = [];
  for (const row of rows) {
    const hour = row.keys?.[hourIndex]?.trim() || '';
    const key = row.keys?.[keyIndex]?.trim() || '';
    if (!isValidHourKey(hour) || !key) continue;
    result.push({
      hour,
      key,
      clicks: asFiniteNumber(row.clicks),
      impressions: asFiniteNumber(row.impressions),
      position: row.position == null || !Number.isFinite(Number(row.position)) ? null : Number(row.position),
    });
  }
  return result;
}

export function aggregateDetailRowsForWindow(
  rows: DetailHourRow[],
  window: HourWindow
): AggregatedDimensionRow[] {
  const byKey = new Map<string, MetricRow & { key: string }>();

  for (const row of rows) {
    if (!hourInWindow(row.hour, window)) continue;
    const existing = byKey.get(row.key);
    if (!existing) {
      byKey.set(row.key, {
        key: row.key,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
      });
      continue;
    }

    const nextClicks = asFiniteNumber(existing.clicks) + row.clicks;
    const nextImpressions = asFiniteNumber(existing.impressions) + row.impressions;
    const leftWeight =
      asFiniteNumber(existing.impressions) > 0 && existing.position != null
        ? asFiniteNumber(existing.position) * asFiniteNumber(existing.impressions)
        : 0;
    const rightWeight = row.impressions > 0 && row.position != null ? row.position * row.impressions : 0;
    const nextPosition = nextImpressions > 0 ? (leftWeight + rightWeight) / nextImpressions : null;

    byKey.set(row.key, {
      key: row.key,
      clicks: nextClicks,
      impressions: nextImpressions,
      position: nextPosition,
    });
  }

  return Array.from(byKey.values())
    .map((row) => ({
      key: row.key,
      clicks: asFiniteNumber(row.clicks),
      impressions: asFiniteNumber(row.impressions),
      position: asFiniteNumber(row.position),
    }))
    .sort((a, b) => b.clicks - a.clicks);
}

export function enrichAggregatedRows(
  currentRows: AggregatedDimensionRow[],
  previousRows: AggregatedDimensionRow[]
) {
  const previousMap = new Map(previousRows.map((row) => [row.key, row]));
  return currentRows.map((row) => {
    const previous = previousMap.get(row.key);
    return {
      key: row.key,
      rawKey: row.key,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
      previousClicks: previous?.clicks || 0,
      previousImpressions: previous?.impressions || 0,
      previousPosition: previous?.position || 0,
    };
  });
}

/** Count delta between independent current/previous dimension lists. */
export function dimensionCountDelta(currentCount: number, previousCount: number) {
  return {
    current: currentCount,
    previous: previousCount,
    delta: currentCount - previousCount,
  };
}

/** Calendar date span in Pacific Time covering at least `hoursBack` hours ending now. */
export function hourlyFetchDateSpan(
  now: Date = new Date(),
  hoursBack = 72
): { startDate: string; endDate: string } {
  const endDate = gscCalendarDate(now);
  const days = Math.ceil(hoursBack / 24) + 1;
  const startMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const startDate = gscCalendarDate(new Date(startMs));
  return { startDate, endDate };
}

export function hoursAgoLabel(latestAvailableHour: string | null, now: Date = new Date()): string | null {
  if (!latestAvailableHour) return null;
  const ms = parseHourMs(latestAvailableHour);
  if (ms === null) return null;
  const diffHours = Math.max(0, Math.round((now.getTime() - ms) / MS_PER_HOUR));
  if (diffHours === 0) return 'менее часа назад';
  if (diffHours === 1) return 'около 1 часа назад';
  if (diffHours < 5) return `около ${diffHours} часов назад`;
  return `около ${diffHours} часов назад`;
}
