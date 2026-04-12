'use client';

import { useMemo, useState } from 'react';

type WorkspaceRow = {
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

export function WorkspaceTable({
  title,
  rows,
  keyLabel,
}: {
  title: string;
  rows: WorkspaceRow[];
  keyLabel: string;
}) {
  const [tab, setTab] = useState<'all' | 'growing' | 'decaying'>('all');
  const [expanded, setExpanded] = useState(false);

  const filteredRows = useMemo(() => {
    if (tab === 'all') return rows;
    return rows.filter((row) => {
      const delta = row.clicks - row.previousClicks;
      return tab === 'growing' ? delta > 0 : delta < 0;
    });
  }, [rows, tab]);

  const visibleRows = expanded ? filteredRows : filteredRows.slice(0, 10);

  return (
    <section className="panel site-detail-panel">
      <div className="mini-tabs">
        <h3>{title}</h3>
        <div>
          <button type="button" className={`mini-tab-btn ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            All
          </button>
          <button type="button" className={`mini-tab-btn ${tab === 'growing' ? 'active' : ''}`} onClick={() => setTab('growing')}>
            Growing
          </button>
          <button type="button" className={`mini-tab-btn ${tab === 'decaying' ? 'active' : ''}`} onClick={() => setTab('decaying')}>
            Decaying
          </button>
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
            {visibleRows.map((row) => (
              <tr key={row.key}>
                <td className="seogets-key-cell">{row.key || '—'}</td>
                <td>
                  <strong>{formatInt(row.clicks)}</strong>
                  <span className={trendClass(percentChange(row.clicks, row.previousClicks))}>{formatPercentChange(percentChange(row.clicks, row.previousClicks))}</span>
                </td>
                <td>
                  <strong>{formatInt(row.impressions)}</strong>
                  <span className={trendClass(percentChange(row.impressions, row.previousImpressions))}>{formatPercentChange(percentChange(row.impressions, row.previousImpressions))}</span>
                </td>
                <td>
                  <strong>{(row.ctr * 100).toFixed(1)}%</strong>
                  <span className={trendClass(percentChange(row.ctr, row.previousCtr))}>{formatPercentChange(percentChange(row.ctr, row.previousCtr))}</span>
                </td>
                <td>
                  <strong>{row.position.toFixed(1)}</strong>
                  <span className={trendClass(row.previousPosition - row.position)}>{formatSigned(row.previousPosition - row.position)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredRows.length > 10 ? (
        <div className="expand-row">
          <button type="button" className="expand-button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function percentChange(current: number, previous: number) {
  if (!previous && !current) return 0;
  if (!previous && current > 0) return 100;
  return ((current - previous) / previous) * 100;
}

function trendClass(value: number) {
  return value >= 0 ? 'good' : 'bad';
}

function formatPercentChange(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatSigned(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}`;
}

function formatInt(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
