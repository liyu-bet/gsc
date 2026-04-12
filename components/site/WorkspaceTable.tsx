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

type SortKey = 'key' | 'clicks' | 'impressions' | 'ctr' | 'position';

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
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredRows = useMemo(() => {
    if (tab === 'all') return rows;
    return rows.filter((row) => {
      const delta = row.clicks - row.previousClicks;
      return tab === 'growing' ? delta > 0 : delta < 0;
    });
  }, [rows, tab]);

  const sortedRows = useMemo(() => {
    const next = [...filteredRows];
    next.sort((a, b) => {
      const left = getValue(a, sortKey);
      const right = getValue(b, sortKey);
      if (typeof left === 'string' && typeof right === 'string') {
        return sortDirection === 'asc' ? left.localeCompare(right) : right.localeCompare(left);
      }
      return sortDirection === 'asc' ? Number(left) - Number(right) : Number(right) - Number(left);
    });
    return next;
  }, [filteredRows, sortDirection, sortKey]);

  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, 10);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'key' ? 'asc' : 'desc');
  }

  return (
    <section className="panel site-detail-panel">
      <div className="mini-tabs">
        <h3>{title}</h3>
        <div>
          <button type="button" className={`mini-tab-btn ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            All
          </button>
          <button
            type="button"
            className={`mini-tab-btn ${tab === 'growing' ? 'active' : ''}`}
            onClick={() => setTab('growing')}
          >
            Growing
          </button>
          <button
            type="button"
            className={`mini-tab-btn ${tab === 'decaying' ? 'active' : ''}`}
            onClick={() => setTab('decaying')}
          >
            Decaying
          </button>
        </div>
      </div>

      <div className="seogets-table-wrap">
        <table className="seogets-table">
          <thead>
            <tr>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('key')}>{keyLabel}{sortMark(sortKey, sortDirection, 'key')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('clicks')}>Clicks{sortMark(sortKey, sortDirection, 'clicks')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('impressions')}>Impressions{sortMark(sortKey, sortDirection, 'impressions')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('ctr')}>CTR{sortMark(sortKey, sortDirection, 'ctr')}</button></th>
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort('position')}>Position{sortMark(sortKey, sortDirection, 'position')}</button></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.key}>
                <td className="seogets-key-cell">{row.key || '—'}</td>
                <td>
                  <strong>{formatInt(row.clicks)}</strong>
                  <span className={trendClass(percentChange(row.clicks, row.previousClicks))}>
                    {formatPercentChange(percentChange(row.clicks, row.previousClicks))}
                  </span>
                </td>
                <td>
                  <strong>{formatInt(row.impressions)}</strong>
                  <span className={trendClass(percentChange(row.impressions, row.previousImpressions))}>
                    {formatPercentChange(percentChange(row.impressions, row.previousImpressions))}
                  </span>
                </td>
                <td>
                  <strong>{(row.ctr * 100).toFixed(1)}%</strong>
                  <span className={trendClass(percentChange(row.ctr, row.previousCtr))}>
                    {formatPercentChange(percentChange(row.ctr, row.previousCtr))}
                  </span>
                </td>
                <td>
                  <strong>{row.position.toFixed(1)}</strong>
                  <span className={trendClass(row.previousPosition - row.position)}>
                    {formatSigned(row.previousPosition - row.position)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedRows.length > 10 ? (
        <div className="expand-row">
          <button type="button" className="expand-button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function getValue(row: WorkspaceRow, key: SortKey) {
  if (key === 'key') return row.key.toLowerCase();
  return row[key];
}

function sortMark(sortKey: SortKey, direction: 'asc' | 'desc', key: SortKey) {
  if (sortKey !== key) return ' ↕';
  return direction === 'asc' ? ' ↑' : ' ↓';
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
