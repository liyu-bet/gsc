import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { defaultDateRange, querySite, SearchAnalyticsRow } from '@/lib/google';
import { deltaPercent, formatDecimal, formatNumber, formatPercent } from '@/lib/format';

type SafeReport = {
  rows: SearchAnalyticsRow[];
  error?: string | null;
};

type EnrichedRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previousClicks: number;
  previousImpressions: number;
  previousCtr: number;
  previousPosition: number;
};

type DailyMetric = {
  label: string;
  color: string;
  current: number[];
  previous: number[];
  currentText: string;
  previousText: string;
  changeText: string;
  changeClass: string;
};

async function safeQuery(
  connectionId: string,
  siteUrl: string,
  body: Record<string, unknown>
): Promise<SafeReport> {
  try {
    const result = await querySite(connectionId, siteUrl, body);
    return { rows: result.rows || [], error: null };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : 'Unknown API error',
    };
  }
}

function metricNumber(row: SearchAnalyticsRow | undefined, key: 'clicks' | 'impressions' | 'ctr' | 'position') {
  return Number(row?.[key] || 0);
}

function mapRowsByKey(rows: SearchAnalyticsRow[]) {
  return new Map(rows.map((row) => [row.keys?.[0] || '', row]));
}

function enrichRows(currentRows: SearchAnalyticsRow[], previousRows: SearchAnalyticsRow[]): EnrichedRow[] {
  const previousMap = mapRowsByKey(previousRows);

  return currentRows
    .map((row) => {
      const key = row.keys?.[0] || '';
      const previous = previousMap.get(key);
      return {
        key,
        clicks: metricNumber(row, 'clicks'),
        impressions: metricNumber(row, 'impressions'),
        ctr: metricNumber(row, 'ctr'),
        position: metricNumber(row, 'position'),
        previousClicks: metricNumber(previous, 'clicks'),
        previousImpressions: metricNumber(previous, 'impressions'),
        previousCtr: metricNumber(previous, 'ctr'),
        previousPosition: metricNumber(previous, 'position'),
      };
    })
    .sort((a, b) => b.clicks - a.clicks);
}

function sum(items: EnrichedRow[], selector: (item: EnrichedRow) => number): number {
  return items.reduce((acc, item) => acc + selector(item), 0);
}

function weightedAverage(items: EnrichedRow[], valueSelector: (item: EnrichedRow) => number, weightSelector: (item: EnrichedRow) => number) {
  const totalWeight = items.reduce((acc, item) => acc + weightSelector(item), 0);
  if (!totalWeight) return 0;
  return items.reduce((acc, item) => acc + valueSelector(item) * weightSelector(item), 0) / totalWeight;
}

function trendClass(value: number) {
  return value >= 0 ? 'good' : 'bad';
}

function formatTrend(value: number, digits = 1) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatDecimal(value, digits)}%`;
}

function formatPositionShift(current: number, previous: number) {
  const shift = previous - current;
  const sign = shift > 0 ? '+' : '';
  return `${sign}${formatDecimal(shift, 1)}`;
}

function buildMetricSeries(dailyCurrent: SearchAnalyticsRow[], dailyPrevious: SearchAnalyticsRow[]): DailyMetric[] {
  const currentClicks = dailyCurrent.map((row) => metricNumber(row, 'clicks'));
  const previousClicks = dailyPrevious.map((row) => metricNumber(row, 'clicks'));
  const currentImpressions = dailyCurrent.map((row) => metricNumber(row, 'impressions'));
  const previousImpressions = dailyPrevious.map((row) => metricNumber(row, 'impressions'));
  const currentCtr = dailyCurrent.map((row) => metricNumber(row, 'ctr') * 100);
  const previousCtr = dailyPrevious.map((row) => metricNumber(row, 'ctr') * 100);
  const currentPosition = dailyCurrent.map((row) => metricNumber(row, 'position'));
  const previousPosition = dailyPrevious.map((row) => metricNumber(row, 'position'));

  const totalClicks = currentClicks.reduce((a, b) => a + b, 0);
  const prevClicks = previousClicks.reduce((a, b) => a + b, 0);
  const totalImpressions = currentImpressions.reduce((a, b) => a + b, 0);
  const prevImpressions = previousImpressions.reduce((a, b) => a + b, 0);
  const avgCtr = totalImpressions ? (totalClicks / totalImpressions) * 100 : 0;
  const prevCtr = prevImpressions ? (prevClicks / prevImpressions) * 100 : 0;
  const avgPosition = currentPosition.length ? currentPosition.reduce((a, b) => a + b, 0) / currentPosition.length : 0;
  const prevPosition = previousPosition.length ? previousPosition.reduce((a, b) => a + b, 0) / previousPosition.length : 0;

  return [
    {
      label: 'Clicks',
      color: '#2563eb',
      current: currentClicks,
      previous: previousClicks,
      currentText: formatNumber(totalClicks),
      previousText: formatNumber(prevClicks),
      changeText: formatTrend(deltaPercent(totalClicks, prevClicks)),
      changeClass: trendClass(deltaPercent(totalClicks, prevClicks)),
    },
    {
      label: 'Impressions',
      color: '#7c3aed',
      current: currentImpressions,
      previous: previousImpressions,
      currentText: formatNumber(totalImpressions),
      previousText: formatNumber(prevImpressions),
      changeText: formatTrend(deltaPercent(totalImpressions, prevImpressions)),
      changeClass: trendClass(deltaPercent(totalImpressions, prevImpressions)),
    },
    {
      label: 'CTR',
      color: '#0f766e',
      current: currentCtr,
      previous: previousCtr,
      currentText: `${formatDecimal(avgCtr, 1)}%`,
      previousText: `${formatDecimal(prevCtr, 1)}%`,
      changeText: formatTrend(deltaPercent(avgCtr, prevCtr)),
      changeClass: trendClass(deltaPercent(avgCtr, prevCtr)),
    },
    {
      label: 'Position',
      color: '#ea580c',
      current: currentPosition,
      previous: previousPosition,
      currentText: formatDecimal(avgPosition, 1),
      previousText: formatDecimal(prevPosition, 1),
      changeText: formatPositionShift(avgPosition, prevPosition),
      changeClass: trendClass(prevPosition - avgPosition),
    },
  ];
}

function buildPolyline(values: number[], width: number, height: number, padding = 14) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
}

function SparkChart({ series, labels }: { series: DailyMetric[]; labels: string[] }) {
  const width = 1120;
  const height = 320;
  return (
    <div className="site-chart-wrap">
      <div className="site-chart-metrics">
        {series.map((metric) => (
          <div key={metric.label} className="site-chart-metric">
            <span className="site-chart-metric-dot" style={{ backgroundColor: metric.color }} />
            <strong>{metric.currentText}</strong>
            <span className={metric.changeClass}>{metric.changeText}</span>
            <span className="muted">{metric.label}</span>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="site-trend-svg" role="img" aria-label="Site performance trend">
        <g>
          {[0.2, 0.5, 0.8].map((stop) => (
            <line
              key={stop}
              x1="14"
              x2={width - 14}
              y1={height - 14 - stop * (height - 28)}
              y2={height - 14 - stop * (height - 28)}
              stroke="#dbe4f0"
              strokeDasharray="4 6"
            />
          ))}
        </g>
        {series.map((metric) => (
          <polyline
            key={`${metric.label}-previous`}
            fill="none"
            stroke={metric.color}
            strokeOpacity="0.45"
            strokeWidth="2"
            strokeDasharray="6 6"
            points={buildPolyline(metric.previous, width, height)}
          />
        ))}
        {series.map((metric) => (
          <polyline
            key={`${metric.label}-current`}
            fill="none"
            stroke={metric.color}
            strokeWidth="2.4"
            points={buildPolyline(metric.current, width, height)}
          />
        ))}
      </svg>
      <div className="site-chart-axis">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function SeoGetsTable({
  title,
  rows,
  keyLabel,
}: {
  title: string;
  rows: EnrichedRow[];
  keyLabel: string;
}) {
  return (
    <section className="panel site-detail-panel">
      <div className="mini-tabs">
        <h3>{title}</h3>
        <div>
          <span className="mini-tab active">All</span>
          <span className="mini-tab">Growing</span>
          <span className="mini-tab">Decaying</span>
        </div>
      </div>
      <div className="seogets-table-wrap">
        <table className="seogets-table">
          <thead>
            <tr>
              <th>{keyLabel}</th>
              <th>Clicks</th>
              <th>Impressions</th>
              <th>CTR</th>
              <th>Position</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((row) => (
              <tr key={row.key}>
                <td className="seogets-key-cell">{row.key || '—'}</td>
                <td>
                  <strong>{formatNumber(row.clicks)}</strong>
                  <span className={trendClass(deltaPercent(row.clicks, row.previousClicks))}>
                    {formatTrend(deltaPercent(row.clicks, row.previousClicks))}
                  </span>
                </td>
                <td>
                  <strong>{formatNumber(row.impressions)}</strong>
                  <span className={trendClass(deltaPercent(row.impressions, row.previousImpressions))}>
                    {formatTrend(deltaPercent(row.impressions, row.previousImpressions))}
                  </span>
                </td>
                <td>
                  <strong>{formatPercent(row.ctr)}</strong>
                  <span className={trendClass(deltaPercent(row.ctr, row.previousCtr))}>
                    {formatTrend(deltaPercent(row.ctr, row.previousCtr))}
                  </span>
                </td>
                <td>
                  <strong>{formatDecimal(row.position, 1)}</strong>
                  <span className={trendClass(row.previousPosition - row.position)}>
                    {formatPositionShift(row.position, row.previousPosition)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RankingBuckets({ rows }: { rows: EnrichedRow[] }) {
  const buckets = [
    { label: '1-3', min: 0, max: 3, color: '#facc15' },
    { label: '4-10', min: 3, max: 10, color: '#1d4ed8' },
    { label: '11-20', min: 10, max: 20, color: '#3b82f6' },
    { label: '21+', min: 20, max: Number.POSITIVE_INFINITY, color: '#93c5fd' },
  ].map((bucket) => ({
    ...bucket,
    total: rows.filter((row) => row.position > bucket.min && row.position <= bucket.max).length,
  }));

  const maxTotal = Math.max(...buckets.map((bucket) => bucket.total), 1);

  return (
    <section className="panel site-detail-panel">
      <div className="mini-tabs">
        <h3>Query counting</h3>
        <div>
          <span className="mini-tab active">Total</span>
          <span className="mini-tab">By ranking</span>
        </div>
      </div>
      <div className="bucket-legend">
        {buckets.map((bucket) => (
          <span key={bucket.label}>
            <i style={{ backgroundColor: bucket.color }} />
            {bucket.label}
          </span>
        ))}
      </div>
      <div className="bucket-bars">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="bucket-bar-card">
            <div className="bucket-bar-label">{bucket.label}</div>
            <div className="bucket-bar-track">
              <div
                className="bucket-bar-fill"
                style={{ width: `${(bucket.total / maxTotal) * 100}%`, backgroundColor: bucket.color }}
              />
            </div>
            <div className="bucket-bar-value">{bucket.total}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BrandedPlaceholder() {
  return (
    <section className="panel site-detail-panel branded-placeholder">
      <div className="mini-tabs">
        <h3>Branded vs non-branded clicks</h3>
        <div>
          <span className="mini-tab active">Trend</span>
          <span className="mini-tab">Comparison</span>
        </div>
      </div>
      <div className="brand-placeholder-box">
        <div className="brand-placeholder-circle">B</div>
        <strong>Missing branded keywords</strong>
        <p className="muted">Add your brand keywords later to separate branded and non-branded traffic for this property.</p>
      </div>
    </section>
  );
}

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const property = await prisma.gscProperty.findUnique({
    where: { id },
    include: { connection: true },
  });

  if (!property) {
    notFound();
  }

  const range = defaultDateRange(90);

  const [dailyCurrent, dailyPrevious, pagesCurrent, pagesPrevious, queriesCurrent, queriesPrevious, devicesCurrent, devicesPrevious, countriesCurrent, countriesPrevious] =
    await Promise.all([
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ['date'],
        rowLimit: 120,
        dataState: 'all',
      }),
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.previousStartDate,
        endDate: range.previousEndDate,
        dimensions: ['date'],
        rowLimit: 120,
        dataState: 'all',
      }),
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ['page'],
        rowLimit: 50,
        dataState: 'all',
      }),
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.previousStartDate,
        endDate: range.previousEndDate,
        dimensions: ['page'],
        rowLimit: 50,
        dataState: 'all',
      }),
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ['query'],
        rowLimit: 50,
        dataState: 'all',
      }),
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.previousStartDate,
        endDate: range.previousEndDate,
        dimensions: ['query'],
        rowLimit: 50,
        dataState: 'all',
      }),
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ['device'],
        rowLimit: 10,
        dataState: 'all',
      }),
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.previousStartDate,
        endDate: range.previousEndDate,
        dimensions: ['device'],
        rowLimit: 10,
        dataState: 'all',
      }),
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ['country'],
        rowLimit: 20,
        dataState: 'all',
      }),
      safeQuery(property.connectionId, property.siteUrl, {
        startDate: range.previousStartDate,
        endDate: range.previousEndDate,
        dimensions: ['country'],
        rowLimit: 20,
        dataState: 'all',
      }),
    ]);

  const pageRows = enrichRows(pagesCurrent.rows, pagesPrevious.rows);
  const queryRows = enrichRows(queriesCurrent.rows, queriesPrevious.rows);
  const deviceRows = enrichRows(devicesCurrent.rows, devicesPrevious.rows);
  const countryRows = enrichRows(countriesCurrent.rows, countriesPrevious.rows);
  const newRankings = queryRows
    .filter((row) => row.previousImpressions === 0 && row.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  const chartSeries = buildMetricSeries(dailyCurrent.rows, dailyPrevious.rows);
  const axisLabels = dailyCurrent.rows
    .filter((_, index) => index % Math.max(Math.floor(dailyCurrent.rows.length / 8), 1) === 0)
    .map((row) => (row.keys?.[0] || '').slice(5));

  const overviewCards = [
    {
      label: 'Queries',
      current: formatNumber(queryRows.length),
      change: formatTrend(deltaPercent(sum(queryRows, (row) => row.clicks), sum(queryRows, (row) => row.previousClicks))),
      changeClass: trendClass(deltaPercent(sum(queryRows, (row) => row.clicks), sum(queryRows, (row) => row.previousClicks))),
    },
    {
      label: 'Pages',
      current: formatNumber(pageRows.length),
      change: formatTrend(deltaPercent(sum(pageRows, (row) => row.clicks), sum(pageRows, (row) => row.previousClicks))),
      changeClass: trendClass(deltaPercent(sum(pageRows, (row) => row.clicks), sum(pageRows, (row) => row.previousClicks))),
    },
    {
      label: 'Countries',
      current: formatNumber(countryRows.length),
      change: formatTrend(deltaPercent(sum(countryRows, (row) => row.clicks), sum(countryRows, (row) => row.previousClicks))),
      changeClass: trendClass(deltaPercent(sum(countryRows, (row) => row.clicks), sum(countryRows, (row) => row.previousClicks))),
    },
    {
      label: 'Devices',
      current: formatNumber(deviceRows.length),
      change: `${formatDecimal(weightedAverage(deviceRows, (row) => row.position, (row) => row.impressions), 1)} avg pos`,
      changeClass: 'good',
    },
  ];

  const errors = [dailyCurrent, dailyPrevious, pagesCurrent, pagesPrevious, queriesCurrent, queriesPrevious, devicesCurrent, devicesPrevious, countriesCurrent, countriesPrevious]
    .map((report) => report.error)
    .filter(Boolean) as string[];

  return (
    <main className="page-shell site-shell">
      <section className="panel site-hero-panel">
        <div className="site-hero-head">
          <div>
            <div className="badge">Site workspace</div>
            <h1>{property.label || property.siteUrl}</h1>
            <p className="muted">{property.siteUrl}</p>
            <p className="muted">Connected Google account: {property.connection.email}</p>
          </div>
          <div className="header-actions">
            <form action={`/api/connections/${property.connectionId}/sync`} method="post">
              <button className="button small" type="submit">Refresh sites</button>
            </form>
            <Link className="button ghost small" href="/dashboard">Back to dashboard</Link>
          </div>
        </div>

        <div className="site-top-cards">
          {overviewCards.map((card) => (
            <div key={card.label} className="site-top-card">
              <span>{card.label}</span>
              <strong>{card.current}</strong>
              <em className={card.changeClass}>{card.change}</em>
            </div>
          ))}
        </div>
      </section>

      {errors.length > 0 ? (
        <div className="alert error">
          Some reports could not be loaded for this site. If you recently removed this property in Search Console, press “Refresh sites” on the connected account so stale properties are removed from the app database.
        </div>
      ) : null}

      <section className="panel site-detail-panel">
        <SparkChart series={chartSeries} labels={axisLabels} />
      </section>

      <section className="grid two-columns site-grid-gap">
        <SeoGetsTable title="Queries" rows={queryRows} keyLabel="Query" />
        <SeoGetsTable title="Pages" rows={pageRows} keyLabel="Page" />
      </section>

      <section className="grid two-columns site-grid-gap">
        <BrandedPlaceholder />
        <RankingBuckets rows={queryRows} />
      </section>

      <section className="grid two-columns site-grid-gap">
        <SeoGetsTable title="Countries" rows={countryRows} keyLabel="Country" />
        <SeoGetsTable title="New rankings" rows={newRankings} keyLabel="Query" />
      </section>

      <SeoGetsTable title="Devices" rows={deviceRows} keyLabel="Device" />
    </main>
  );
}
