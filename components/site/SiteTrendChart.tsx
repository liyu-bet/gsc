'use client';

import { useEffect, useMemo, useState } from 'react';

export type TrendMetricKey = 'clicks' | 'impressions' | 'position';

export type TrendSeriesPoint = {
  /** ISO hour or yyyy-MM-dd — formatted on the client for hourly mode. */
  key: string;
  clicks: number;
  impressions: number;
  position: number;
};

type MetricCard = {
  key: TrendMetricKey;
  label: string;
  color: string;
  valueText: string;
  changeText?: string;
  changeClass?: string;
};

const DEFAULT_ENABLED: TrendMetricKey[] = ['clicks', 'impressions'];
const STORAGE_KEY = 'gsk-site-chart-metrics';

function formatHourLabel(isoHour: string, includeDate: boolean) {
  const date = new Date(isoHour);
  if (Number.isNaN(date.getTime())) return isoHour;
  if (includeDate) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDailyLabel(ymd: string) {
  const date = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
}

function formatTooltipValue(key: TrendMetricKey, value: number) {
  if (key === 'position') return value.toFixed(1);
  return Number.isInteger(value) ? value.toLocaleString('ru-RU') : value.toFixed(1);
}

export function SiteTrendChart({
  mode,
  currentPoints,
  previousPoints,
  compare,
  firstIncompleteKey,
  cards,
  rangeCaption,
}: {
  mode: 'hourly' | 'daily';
  currentPoints: TrendSeriesPoint[];
  previousPoints: TrendSeriesPoint[];
  compare: boolean;
  firstIncompleteKey?: string | null;
  cards: MetricCard[];
  rangeCaption?: string | null;
}) {
  const width = 1120;
  const height = 320;
  const paddingLeft = 48;
  const paddingRight = 48;
  const paddingTop = 18;
  const paddingBottom = 28;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<TrendMetricKey[]>(DEFAULT_ENABLED);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = raw
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is TrendMetricKey =>
          item === 'clicks' || item === 'impressions' || item === 'position'
        );
      if (parsed.length) setEnabled(parsed);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, enabled.join(','));
  }, [enabled]);

  const labels = useMemo(() => {
    return currentPoints.map((point, index) => {
      if (mode === 'hourly') {
        const date = new Date(point.key);
        const prev = index > 0 ? new Date(currentPoints[index - 1].key) : null;
        const crossedDay =
          !prev ||
          Number.isNaN(date.getTime()) ||
          Number.isNaN(prev.getTime()) ||
          date.toDateString() !== prev.toDateString();
        return formatHourLabel(point.key, crossedDay || index === 0);
      }
      return formatDailyLabel(point.key);
    });
  }, [currentPoints, mode]);

  const previousLabels = useMemo(() => {
    return previousPoints.map((point) =>
      mode === 'hourly' ? formatHourLabel(point.key, true) : formatDailyLabel(point.key)
    );
  }, [mode, previousPoints]);

  const incompleteIndex = useMemo(() => {
    if (!firstIncompleteKey) return -1;
    return currentPoints.findIndex((point) => point.key === firstIncompleteKey);
  }, [currentPoints, firstIncompleteKey]);

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const maxLength = Math.max(currentPoints.length, 1);
  const step = plotWidth / Math.max(maxLength - 1, 1);

  const clicksValues = currentPoints.map((p) => p.clicks);
  const impressionsValues = currentPoints.map((p) => p.impressions);
  const positionValues = currentPoints.map((p) => p.position);
  const prevClicks = previousPoints.map((p) => p.clicks);
  const prevImpressions = previousPoints.map((p) => p.impressions);
  const prevPosition = previousPoints.map((p) => p.position);

  const clicksMax = Math.max(1, ...clicksValues, ...(compare ? prevClicks : []));
  const impressionsMax = Math.max(1, ...impressionsValues, ...(compare ? prevImpressions : []));
  const positionMax = Math.max(1, ...positionValues, ...(compare ? prevPosition : []), 1);
  const positionMin = 0;

  function yFor(metric: TrendMetricKey, value: number) {
    if (metric === 'clicks') {
      return paddingTop + plotHeight - (value / clicksMax) * plotHeight;
    }
    if (metric === 'impressions') {
      return paddingTop + plotHeight - (value / impressionsMax) * plotHeight;
    }
    const span = positionMax - positionMin || 1;
    return paddingTop + plotHeight - ((value - positionMin) / span) * plotHeight;
  }

  function xFor(index: number) {
    if (maxLength <= 1) return paddingLeft + plotWidth / 2;
    return paddingLeft + index * step;
  }

  function polyline(values: number[], metric: TrendMetricKey, fromIndex: number, toIndex: number) {
    const points: string[] = [];
    for (let i = fromIndex; i <= toIndex; i += 1) {
      if (i < 0 || i >= values.length) continue;
      points.push(`${xFor(i)},${yFor(metric, values[i] ?? 0)}`);
    }
    return points.join(' ');
  }

  function toggleMetric(key: TrendMetricKey) {
    setEnabled((current) => {
      if (current.includes(key)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  }

  const axisStep = Math.max(Math.ceil(labels.length / 6), 1);
  const visibleAxisLabels = labels
    .map((label, index) => ({ label, index }))
    .filter((item) => item.index % axisStep === 0 || item.index === labels.length - 1);

  const hoverX = hoverIndex === null ? null : xFor(hoverIndex);

  const metricMeta: Array<{
    key: TrendMetricKey;
    label: string;
    color: string;
    values: number[];
    previous: number[];
  }> = (
    [
      { key: 'clicks' as const, label: 'Клики', color: '#2563eb', values: clicksValues, previous: prevClicks },
      {
        key: 'impressions' as const,
        label: 'Показы',
        color: '#7c3aed',
        values: impressionsValues,
        previous: prevImpressions,
      },
      {
        key: 'position' as const,
        label: 'Позиция',
        color: '#ea580c',
        values: positionValues,
        previous: prevPosition,
      },
    ] satisfies Array<{
      key: TrendMetricKey;
      label: string;
      color: string;
      values: number[];
      previous: number[];
    }>
  ).filter((metric) => enabled.includes(metric.key));

  return (
    <div className="site-chart-wrap">
      <div className="site-chart-metrics site-chart-toggle-row">
        {cards.map((card) => {
          const active = enabled.includes(card.key);
          return (
            <button
              key={card.key}
              type="button"
              className={`metric-toggle ${active ? 'active' : ''}`}
              onClick={() => toggleMetric(card.key)}
            >
              <span className="site-chart-metric-dot" style={{ backgroundColor: card.color }} />
              <span className="metric-toggle-copy">
                <span className="muted">{card.label}</span>
                <strong>{card.valueText}</strong>
                {compare && card.changeText ? (
                  <em className={card.changeClass || ''}>{card.changeText}</em>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {rangeCaption ? <div className="muted site-chart-caption">{rangeCaption}</div> : null}

      <div className="site-chart-shell">
        {hoverIndex !== null ? (
          <div
            className="site-tooltip"
            style={{
              left: `min(${Math.max(((hoverX ?? 60) / width) * 100, 10)}%, calc(100% - 250px))`,
            }}
          >
            <div className={`site-tooltip-head ${compare ? '' : 'single'}`}>
              <strong>{labels[hoverIndex] || '—'}</strong>
              {compare ? <strong>{previousLabels[hoverIndex] || '—'}</strong> : null}
            </div>
            {metricMeta.map((metric) => (
              <div key={metric.key} className={`site-tooltip-row ${compare ? '' : 'single'}`}>
                <div>
                  <i style={{ backgroundColor: metric.color }} />
                  <span>{metric.label}</span>
                </div>
                <div>{formatTooltipValue(metric.key, metric.values[hoverIndex] ?? 0)}</div>
                {compare ? (
                  <div>{formatTooltipValue(metric.key, metric.previous[hoverIndex] ?? 0)}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="site-trend-svg"
          role="img"
          aria-label="Динамика показателей сайта"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const rawX =
              ((event.clientX - rect.left) / rect.width) * plotWidth;
            const nextIndex = Math.max(0, Math.min(maxLength - 1, Math.round(rawX / Math.max(step, 1))));
            setHoverIndex(nextIndex);
          }}
        >
          <g>
            {[0.25, 0.5, 0.75].map((stop) => (
              <line
                key={stop}
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={paddingTop + plotHeight * (1 - stop)}
                y2={paddingTop + plotHeight * (1 - stop)}
                stroke="#dbe4f0"
                strokeDasharray="4 6"
              />
            ))}
          </g>

          {enabled.includes('clicks') ? (
            <text x={8} y={paddingTop + 8} className="chart-axis-label" fill="#2563eb" fontSize="11">
              Клики
            </text>
          ) : null}
          {enabled.includes('impressions') ? (
            <text
              x={width - 8}
              y={paddingTop + 8}
              textAnchor="end"
              className="chart-axis-label"
              fill="#7c3aed"
              fontSize="11"
            >
              Показы
            </text>
          ) : null}

          {metricMeta.map((metric) => {
            const last = metric.values.length - 1;
            const hasPreliminary = incompleteIndex >= 0;

            return (
              <g key={metric.key}>
                {compare ? (
                  <polyline
                    fill="none"
                    stroke={metric.color}
                    strokeOpacity="0.35"
                    strokeWidth="2"
                    strokeDasharray="6 6"
                    points={polyline(metric.previous, metric.key, 0, metric.previous.length - 1)}
                  />
                ) : null}

                {!hasPreliminary ? (
                  <polyline
                    fill="none"
                    stroke={metric.color}
                    strokeWidth="2.4"
                    points={polyline(metric.values, metric.key, 0, last)}
                  />
                ) : null}

                {hasPreliminary && incompleteIndex > 0 ? (
                  <polyline
                    fill="none"
                    stroke={metric.color}
                    strokeWidth="2.4"
                    points={polyline(metric.values, metric.key, 0, incompleteIndex)}
                  />
                ) : null}

                {hasPreliminary ? (
                  <polyline
                    fill="none"
                    stroke={metric.color}
                    strokeWidth="2.4"
                    strokeDasharray="5 5"
                    points={polyline(
                      metric.values,
                      metric.key,
                      Math.max(incompleteIndex - 1, 0),
                      last
                    )}
                  />
                ) : null}

                {/* Always draw a visible marker for single-point series. */}
                {metric.values.length === 1 ? (
                  <circle
                    cx={xFor(0)}
                    cy={yFor(metric.key, metric.values[0] ?? 0)}
                    r="5"
                    fill={metric.color}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                ) : null}
              </g>
            );
          })}

          {hoverX !== null ? (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={paddingTop}
              y2={height - paddingBottom}
              stroke="#9aa7ba"
              strokeWidth="1"
            />
          ) : null}

          {hoverIndex !== null
            ? metricMeta.map((metric) => (
                <circle
                  key={`${metric.key}-dot`}
                  cx={hoverX ?? 0}
                  cy={yFor(metric.key, metric.values[hoverIndex] ?? 0)}
                  r="3.8"
                  fill={metric.color}
                  stroke="#fff"
                  strokeWidth="2"
                />
              ))
            : null}
        </svg>

        <div className="site-axis-overlay">
          {visibleAxisLabels.map((item) => {
            const left = maxLength <= 1 ? 50 : (item.index / Math.max(maxLength - 1, 1)) * 100;
            return (
              <span key={`${item.label}-${item.index}`} className="site-axis-chip" style={{ left: `${left}%` }}>
                {item.label}
              </span>
            );
          })}
        </div>

        {incompleteIndex >= 0 ? (
          <div className="site-chart-legend-note muted">Пунктир — предварительные данные</div>
        ) : null}
      </div>
    </div>
  );
}

