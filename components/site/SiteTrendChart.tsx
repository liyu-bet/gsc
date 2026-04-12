'use client';

import { useMemo, useState } from 'react';

type TrendMetric = {
  label: string;
  color: string;
  current: number[];
  previous: number[];
  currentText: string;
  previousText: string;
  changeText: string;
  changeClass: string;
};

export function SiteTrendChart({
  series,
  labels,
  previousLabels,
}: {
  series: TrendMetric[];
  labels: string[];
  previousLabels: string[];
}) {
  const width = 1120;
  const height = 320;
  const padding = 14;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const maxLength = Math.max(...series.map((metric) => metric.current.length), 1);

  const seriesMeta = useMemo(() => {
    return series.map((metric) => {
      const merged = [...metric.current, ...metric.previous];
      const min = Math.min(...merged, 0);
      const max = Math.max(...merged, 1);
      const span = max - min || 1;
      return { ...metric, min, max, span };
    });
  }, [series]);

  const tooltip =
    hoverIndex === null
      ? null
      : {
          currentLabel: labels[hoverIndex] || '—',
          previousLabel: previousLabels[hoverIndex] || '—',
          items: seriesMeta.map((metric) => ({
            label: metric.label,
            color: metric.color,
            current: metric.current[hoverIndex] ?? 0,
            previous: metric.previous[hoverIndex] ?? 0,
          })),
        };

  function pointY(value: number, min: number, span: number) {
    return height - padding - ((value - min) / span) * (height - padding * 2);
  }

  function polyline(values: number[], min: number, span: number) {
    if (!values.length) return '';
    return values
      .map((value, index) => {
        const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
        const y = pointY(value, min, span);
        return `${x},${y}`;
      })
      .join(' ');
  }

  const step = (width - padding * 2) / Math.max(maxLength - 1, 1);
  const hoverX = hoverIndex === null ? null : padding + hoverIndex * step;

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

      <div className="site-chart-shell">
        {tooltip ? (
          <div
            className="site-tooltip"
            style={{ left: `min(${Math.max(((hoverX ?? 60) / width) * 100, 10)}%, calc(100% - 250px))` }}
          >
            <div className="site-tooltip-head">
              <strong>{tooltip.currentLabel}</strong>
              <strong>{tooltip.previousLabel}</strong>
            </div>
            {tooltip.items.map((item) => (
              <div key={item.label} className="site-tooltip-row">
                <div>
                  <i style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
                <div>{formatTooltipValue(item.label, item.current)}</div>
                <div>{formatTooltipValue(item.label, item.previous)}</div>
              </div>
            ))}
          </div>
        ) : null}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="site-trend-svg"
          role="img"
          aria-label="Site performance trend"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const rawX = ((event.clientX - rect.left) / rect.width) * (width - padding * 2);
            const nextIndex = Math.max(0, Math.min(maxLength - 1, Math.round(rawX / Math.max(step, 1))));
            setHoverIndex(nextIndex);
          }}
        >
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

          {seriesMeta.map((metric) => (
            <polyline
              key={`${metric.label}-previous`}
              fill="none"
              stroke={metric.color}
              strokeOpacity="0.45"
              strokeWidth="2"
              strokeDasharray="6 6"
              points={polyline(metric.previous, metric.min, metric.span)}
            />
          ))}

          {seriesMeta.map((metric) => (
            <polyline
              key={`${metric.label}-current`}
              fill="none"
              stroke={metric.color}
              strokeWidth="2.4"
              points={polyline(metric.current, metric.min, metric.span)}
            />
          ))}

          {hoverX !== null ? (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={padding}
              y2={height - padding}
              stroke="#9aa7ba"
              strokeWidth="1"
            />
          ) : null}

          {hoverIndex !== null
            ? seriesMeta.map((metric) => {
                const value = metric.current[hoverIndex] ?? 0;
                return (
                  <circle
                    key={`${metric.label}-dot`}
                    cx={hoverX ?? 0}
                    cy={pointY(value, metric.min, metric.span)}
                    r="3.8"
                    fill={metric.color}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                );
              })
            : null}
        </svg>
      </div>

      <div className="site-chart-axis">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`}>
            {index % Math.max(Math.floor(labels.length / 8), 1) === 0 ? label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatTooltipValue(label: string, value: number) {
  if (label === 'CTR') return `${value.toFixed(1)}%`;
  if (label === 'Position') return value.toFixed(1);
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(1);
}