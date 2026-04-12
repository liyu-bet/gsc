import Link from 'next/link';
import { formatDecimal, formatNumber, formatPercent } from '@/lib/format';

type MetricKey = 'clicks' | 'impressions' | 'ctr' | 'position';

type MetricSnapshot = {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number;
};

type PortfolioCardProps = {
  id: string;
  label: string;
  siteUrl: string;
  metrics: Record<MetricKey, MetricSnapshot>;
  visibleMetrics: MetricKey[];
  currentSeries: Record<MetricKey, number[]>;
  previousSeries: Record<MetricKey, number[]>;
  compare: boolean;
  error?: string | null;
};

const METRIC_META: Record<MetricKey, { label: string; icon: string; color: string }> = {
  clicks: { label: 'Clicks', icon: '✦', color: '#2563eb' },
  impressions: { label: 'Impressions', icon: '◉', color: '#7c3aed' },
  ctr: { label: 'CTR', icon: '∕', color: '#0f766e' },
  position: { label: 'Avg position', icon: '⌃', color: '#ea580c' },
};

export function PortfolioCard({
  id,
  label,
  siteUrl,
  metrics,
  visibleMetrics,
  currentSeries,
  previousSeries,
  compare,
  error,
}: PortfolioCardProps) {
  const chart = buildChartPaths(visibleMetrics, currentSeries, previousSeries, compare);

  return (
    <article className="portfolio-card panel panel-compact">
      <div className="portfolio-title-row">
        <div className="portfolio-title-wrap">
          <span aria-hidden="true" className="site-avatar">
            {label.slice(0, 1).toUpperCase()}
          </span>
          <Link className="portfolio-title" href={`/sites/${id}`}>
            {siteUrl}
          </Link>
        </div>
        <Link className="open-arrow" href={`/sites/${id}`}>
          →
        </Link>
      </div>

      <div className="portfolio-metrics-row">
        {visibleMetrics.map((metricKey) => {
          const meta = METRIC_META[metricKey];
          const snapshot = metrics[metricKey];
          const isPositive = metricKey === 'position' ? snapshot.delta <= 0 : snapshot.delta >= 0;
          const deltaClass = isPositive ? 'good' : 'bad';

          return (
            <div className="portfolio-metric" key={metricKey} style={{ ['--metric-color' as string]: meta.color }}>
              <div className="portfolio-metric-line">
                <span className="metric-icon">{meta.icon}</span>
                <strong>{formatMetricValue(metricKey, snapshot.current)}</strong>
                <span className={deltaClass}>{formatDelta(metricKey, snapshot)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sparkline-frame">
        <svg className="sparkline" preserveAspectRatio="none" viewBox="0 0 420 120">
          <line className="spark-baseline" x1="0" x2="420" y1="110" y2="110" />
          {chart.map((entry) => (
            <g key={entry.key}>
              {compare && entry.previousPath ? (
                <path
                  d={entry.previousPath}
                  fill="none"
                  opacity="0.55"
                  stroke={entry.color}
                  strokeDasharray="5 5"
                  strokeWidth="1.8"
                />
              ) : null}
              {entry.currentPath ? (
                <path d={entry.currentPath} fill="none" stroke={entry.color} strokeWidth="2.1" />
              ) : null}
            </g>
          ))}
        </svg>
      </div>

      <div className="portfolio-actions-row">
        <span className="small-text">{label}</span>
        <div className="portfolio-actions-mini">
          <Link className="mini-link" href={`/sites/${id}`}>
            Open
          </Link>
        </div>
      </div>

      {error ? <div className="small-text bad">{error}</div> : null}
    </article>
  );
}

function formatMetricValue(metric: MetricKey, value: number) {
  if (metric === 'ctr') return formatPercent(value);
  if (metric === 'position') return formatDecimal(value, 1);
  if (metric === 'impressions') return compactNumber(value);
  return formatNumber(value);
}

function formatDelta(metric: MetricKey, snapshot: MetricSnapshot) {
  if (!Number.isFinite(snapshot.delta) || !Number.isFinite(snapshot.deltaPct)) return '•';

  if (metric === 'position') {
    const delta = snapshot.previous - snapshot.current;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${formatDecimal(delta, 1)}`;
  }

  const sign = snapshot.deltaPct >= 0 ? '+' : '';
  return `${sign}${formatDecimal(snapshot.deltaPct, 0)}%`;
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${formatDecimal(value / 1_000_000, 1)}M`;
  if (value >= 1_000) return `${formatDecimal(value / 1_000, 1)}k`;
  return formatNumber(value);
}

function buildChartPaths(
  visibleMetrics: MetricKey[],
  currentSeries: Record<MetricKey, number[]>,
  previousSeries: Record<MetricKey, number[]>,
  compare: boolean
) {
  const width = 420;
  const height = 110;

  return visibleMetrics.map((key) => {
    const color = METRIC_META[key].color;
    const currentValues = currentSeries[key] || [];
    const previousValues = previousSeries[key] || [];
    const combined = compare ? [...currentValues, ...previousValues] : currentValues;
    const normalized = normalizeMetricValues(key, combined);
    const currentPath = buildPath(currentValues, normalized.min, normalized.max, width, height, key);
    const previousPath = compare
      ? buildPath(previousValues, normalized.min, normalized.max, width, height, key)
      : '';

    return {
      key,
      color,
      currentPath,
      previousPath,
    };
  });
}

function normalizeMetricValues(metric: MetricKey, values: number[]) {
  if (!values.length) {
    return { min: 0, max: 1 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (metric === 'position') {
    return { min, max: max === min ? max + 1 : max };
  }

  return { min: 0, max: max === 0 ? 1 : max };
}

function buildPath(
  values: number[],
  min: number,
  max: number,
  width: number,
  height: number,
  metric: MetricKey
) {
  if (!values.length) return '';

  const step = values.length === 1 ? width : width / (values.length - 1);
  const range = max - min || 1;

  const points = values.map((value, index) => {
    const x = step * index;
    const normalized = metric === 'position' ? 1 - (value - min) / range : (value - min) / range;
    const y = height - normalized * height;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return points.join(' ');
}
