'use client';

import { useMemo } from 'react';

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
  const width = 760;
  const height = 260;
  const padding = 18;

  const maxValue = useMemo(() => {
    const all = series.flatMap((item) => item.values);
    return Math.max(...all, 1);
  }, [series]);

  function pointY(value: number) {
    return height - padding - (value / maxValue) * (height - padding * 2);
  }

  function polyline(values: number[]) {
    if (!values.length) return '';
    return values
      .map((value, index) => {
        const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
        const y = pointY(value);
        return `${x},${y}`;
      })
      .join(' ');
  }

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
        {series.map((item) => (
          <span key={item.label}>
            <i style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="site-trend-svg" role="img" aria-label="Query counting trend">
        {[0.25, 0.5, 0.75].map((stop) => (
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

        {series.map((item) => (
          <polyline
            key={item.label}
            fill="none"
            stroke={item.color}
            strokeWidth="2.2"
            points={polyline(item.values)}
          />
        ))}
      </svg>

      <div className="site-chart-axis">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`}>
            {index % Math.max(Math.floor(labels.length / 8), 1) === 0 ? label : ''}
          </span>
        ))}
      </div>

      <div className="bucket-bars">
        {series.map((item) => {
          const total = item.values.reduce((a, b) => a + b, 0);
          const share = maxValue ? (Math.max(...item.values, 0) / maxValue) * 100 : 0;

          return (
            <div key={item.label} className="bucket-bar-card">
              <div className="bucket-bar-label">{item.label}</div>
              <div className="bucket-bar-track">
                <div
                  className="bucket-bar-fill"
                  style={{
                    width: `${share}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
              <div className="bucket-bar-value">{total}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}