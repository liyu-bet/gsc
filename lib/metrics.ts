export type MetricRow = {
  clicks?: number | null;
  impressions?: number | null;
  position?: number | null;
};

export type MetricTotals = {
  clicks: number;
  impressions: number;
  position: number;
};

export type MetricDelta = {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number;
};

function asFiniteNumber(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function weightedAveragePosition(rows: MetricRow[]): number {
  let weighted = 0;
  let impressions = 0;

  for (const row of rows) {
    const rowImpressions = asFiniteNumber(row.impressions);
    if (rowImpressions <= 0) continue;
    weighted += asFiniteNumber(row.position) * rowImpressions;
    impressions += rowImpressions;
  }

  if (impressions <= 0) return 0;
  return weighted / impressions;
}

export function summarizeMetricRows(rows: MetricRow[]): MetricTotals {
  let clicks = 0;
  let impressions = 0;

  for (const row of rows) {
    clicks += asFiniteNumber(row.clicks);
    impressions += asFiniteNumber(row.impressions);
  }

  return {
    clicks,
    impressions,
    position: weightedAveragePosition(rows),
  };
}

export function metricDelta(current: number, previous: number): MetricDelta {
  const safeCurrent = asFiniteNumber(current);
  const safePrevious = asFiniteNumber(previous);
  const delta = safeCurrent - safePrevious;
  const deltaPct =
    safePrevious === 0 ? (safeCurrent === 0 ? 0 : 100) : (delta / safePrevious) * 100;

  return {
    current: safeCurrent,
    previous: safePrevious,
    delta,
    deltaPct,
  };
}

export function formatCountDelta(delta: number, singular: string, plural: string): string {
  const safeDelta = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const absolute = Math.abs(safeDelta);
  const unit = absolute === 1 ? singular : plural;
  const sign = safeDelta > 0 ? '+' : safeDelta < 0 ? '-' : '';
  return `${sign}${absolute} ${unit}`;
}

export function countDeltaClass(delta: number): 'good' | 'bad' {
  return delta >= 0 ? 'good' : 'bad';
}

export function positionImprovement(current: number, previous: number): number {
  // Lower position is better in Search Console.
  return asFiniteNumber(previous) - asFiniteNumber(current);
}
