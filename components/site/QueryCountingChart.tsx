'use client';

import { useMemo, useState } from 'react';

type BucketSeries = {
  label: string;
  color: string;
  values: number[];
};

export function QueryCountingChart({
  labels,
  series,
}: {
  labels: string[];
  series: BucketSeries[];
}) {
  const [stacked, setStacked] = useState(false);
  const [mode, setMode] = useState<'total' | 'ranking'>('total');

  const totals = useMemo(() => {
    if (mode === 'total') {
      return [
        {
          label: 'Total',
          color: '#60a5fa',
          values: labels.map((_, index) => series.reduce((acc, item) => acc + (item.values[index] || 0), 0)),
        },
      ];
    }
    return series;
  }, [labels, mode, series]);

  const width = 720;
  const height = 220;
  const padding = 18;
  const max = Math.max(
    1,
    ...labels.map((_, index) => totals.reduce((acc, item) => acc + (stacked ? item.values[index] || 0 : 0), 0)),
    ...totals.flatMap((item) => item.values)
  );

  const axisStep = Math.max(Math.ceil(labels.length / 6), 1);
  const visibleAxisLabels = labels
    .map((label, index) => ({ label, index }))
    .filter((item) => item.index % axisStep === 0 || item.index === labels.length - 1);

  function path(values: number[], offsetValues?: number[]) {
    return values
      .map((value, index) => {
        const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
        const stackedValue = value + (offsetValues?.[index] || 0);
        const y = height - padding - (stackedValue / max) * (height - padding * 2);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }

  return (
    <section className="panel site-detail-panel">
      <div className="mini-tabs">
        <h3>Query counting</h3>
        <div>
          <button type="button" className={`mini-tab-btn ${mode === 'total' ? 'active' : ''}`} onClick={() => setMode('total')}>
            Total
          </button>
          <button type="button" className={`mini-tab-btn ${mode === 'ranking' ? 'active' : ''}`} onClick={() => setMode('ranking')}>
            By ranking
          </button>
        </div>
      </div>

      <div className="bucket-legend bucket-legend-top">
        {series.map((bucket) => (
          <span key={bucket.label}>
            <i style={{ backgroundColor: bucket.color }} />
            {bucket.label}
          </span>
        ))}
        <label className="stacked-toggle">
          <input type="checkbox" checked={stacked} onChange={(event) => setStacked(event.target.checked)} />
          <span>Stacked view</span>
        </label>
      </div>

      <div className="site-chart-shell">
        <svg viewBox={`0 0 ${width} ${height}`} className="site-trend-svg query-counting-chart">
          {[0.2, 0.5, 0.8].map((stop) => (
            <line
              key={stop}
              x1={padding}
              x2={width - padding}
              y1={height - padding - stop * (height - padding * 2)}
              y2={height - padding - stop * (height - padding * 2)}
              stroke="#dbe4f0"
              strokeDasharray="4 6"
            />
          ))}
          {totals.map((bucket, index) => {
            const offsetValues =
              stacked && mode === 'ranking'
                ? labels.map((_, rowIndex) =>
                    totals.slice(0, index).reduce((acc, item) => acc + (item.values[rowIndex] || 0), 0)
                  )
                : undefined;

            return (
              <polyline
                key={bucket.label}
                fill="none"
                stroke={bucket.color}
                strokeWidth="2.2"
                points={path(bucket.values, offsetValues)}
              />
            );
          })}
        </svg>

        <div className="site-axis-overlay">
          {visibleAxisLabels.map((item) => {
            const left =
              labels.length <= 1 ? 0 : (item.index / Math.max(labels.length - 1, 1)) * 100;
            return (
              <span
                key={`${item.label}-${item.index}`}
                className="site-axis-chip"
                style={{ left: `${left}%` }}
              >
                {item.label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}