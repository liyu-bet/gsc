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
 * Build a continuous hour scale ending at `anchorHour` (inclusive),
 * length = `hours`. Missing hours are zero-filled.
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
    const targetMs = anchorMs - offset * 60 * 60 * 1000;
    // Prefer an exact key from API when present at this timestamp; otherwise synthesize ISO.
    const existingKey = findHourKeyAtMs(rowsByHour, targetMs);
    const hourKey = existingKey || synthesizeHourKey(anchorHour, targetMs);
    rows.push(rowsByHour.get(hourKey) || emptyHourRow(hourKey));
  }

  return {
    start: rows[0]?.hour || anchorHour,
    end: rows[rows.length - 1]?.hour || anchorHour,
    rows,
  };
}

function findHourKeyAtMs(rowsByHour: Map<string, HourlyMetricRow>, targetMs: number): string | null {
  for (const key of rowsByHour.keys()) {
    if (parseHourMs(key) === targetMs) return key;
  }
  return null;
}

function synthesizeHourKey(templateHour: string, targetMs: number): string {
  const offsetMatch = templateHour.match(/([+-]\d{2}:\d{2}|Z)$/);
  const offset = offsetMatch?.[1] || 'Z';
  const date = new Date(targetMs);

  if (offset === 'Z') {
    return `${formatUtcComponents(date)}Z`;
  }

  const sign = offset.startsWith('-') ? -1 : 1;
  const [hoursRaw, minutesRaw] = offset.slice(1).split(':');
  const offsetMinutes = sign * (Number(hoursRaw) * 60 + Number(minutesRaw));
  const localMs = targetMs + offsetMinutes * 60 * 1000;
  const local = new Date(localMs);
  return `${formatUtcComponents(local)}${offset}`;
}

function formatUtcComponents(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:00:00`;
}

export function buildLatestHourlyWindows(
  rows: HourlyMetricRow[],
  hours = 24
): HourlyWindows {
  const normalized = [...rows].sort((a, b) => compareHourKeys(a.hour, b.hour));
  if (!normalized.length) {
    const empty: HourWindow = { start: '', end: '', rows: [] };
    return { current: empty, previous: empty, latestAvailableHour: null };
  }

  const latestAvailableHour = normalized[normalized.length - 1].hour;
  const rowsByHour = new Map(normalized.map((row) => [row.hour, row]));

  const current = buildFilledHourWindow(rowsByHour, latestAvailableHour, hours);
  const previousAnchorMs = parseHourMs(latestAvailableHour);
  if (previousAnchorMs === null) {
    return { current, previous: { start: '', end: '', rows: [] }, latestAvailableHour };
  }

  const previousAnchor = synthesizeHourKey(latestAvailableHour, previousAnchorMs - hours * 60 * 60 * 1000);
  // Prefer an existing key at previous anchor timestamp when available.
  const previousAnchorExisting = findHourKeyAtMs(rowsByHour, previousAnchorMs - hours * 60 * 60 * 1000) || previousAnchor;
  const previous = buildFilledHourWindow(rowsByHour, previousAnchorExisting, hours);

  return { current, previous, latestAvailableHour };
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

/** Calendar date span in Pacific Time covering at least `hoursBack` hours ending now. */
export function hourlyFetchDateSpan(
  now: Date = new Date(),
  hoursBack = 72
): { startDate: string; endDate: string } {
  const endDate = gscCalendarDate(now);
  // Request enough calendar days to cover hoursBack plus buffer for DST.
  const days = Math.ceil(hoursBack / 24) + 1;
  const startMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const startDate = gscCalendarDate(new Date(startMs));
  return { startDate, endDate };
}

export function hoursAgoLabel(latestAvailableHour: string | null, now: Date = new Date()): string | null {
  if (!latestAvailableHour) return null;
  const ms = parseHourMs(latestAvailableHour);
  if (ms === null) return null;
  const diffHours = Math.max(0, Math.round((now.getTime() - ms) / (60 * 60 * 1000)));
  if (diffHours === 0) return 'менее часа назад';
  if (diffHours === 1) return 'около 1 часа назад';
  if (diffHours < 5) return `около ${diffHours} часов назад`;
  return `около ${diffHours} часов назад`;
}
