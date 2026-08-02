import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateDetailRowsForWindow,
  buildLatestHourlyWindows,
  compareHourKeys,
  enrichAggregatedRows,
  hourInWindow,
  normalizeDetailHourRows,
  normalizeHourlyRows,
  summarizeHourWindow,
} from './hourly-ranges';

function hour(iso: string, clicks = 0, impressions = 0, position: number | null = 0) {
  return { hour: iso, clicks, impressions, position };
}

describe('hourly-ranges sorting and windows', () => {
  it('sorts ISO hours regardless of input order', () => {
    const rows = normalizeHourlyRows([
      { keys: ['2026-08-01T22:00:00-07:00'], clicks: 1, impressions: 10, position: 5 },
      { keys: ['2026-08-01T20:00:00-07:00'], clicks: 2, impressions: 20, position: 4 },
      { keys: ['2026-08-01T21:00:00-07:00'], clicks: 3, impressions: 30, position: 3 },
    ]);
    assert.deepEqual(
      rows.map((row) => row.hour),
      ['2026-08-01T20:00:00-07:00', '2026-08-01T21:00:00-07:00', '2026-08-01T22:00:00-07:00']
    );
    assert.ok(compareHourKeys(rows[0].hour, rows[1].hour) < 0);
  });

  it('builds exact 24-hour current and previous windows from latest hour', () => {
    const rows = [];
    for (let i = 0; i < 60; i += 1) {
      const hourNum = 20 - (59 - i);
      // Build 60 consecutive hours ending at 2026-08-02T20:00:00-07:00
      const base = Date.parse('2026-08-02T20:00:00-07:00') - (59 - i) * 3600_000;
      const iso = synthesizePacific(base);
      rows.push(hour(iso, i + 1, (i + 1) * 10, 5));
    }

    const windows = buildLatestHourlyWindows(rows, 24);
    assert.equal(windows.latestAvailableHour, '2026-08-02T20:00:00-07:00');
    assert.equal(windows.current.rows.length, 24);
    assert.equal(windows.previous.rows.length, 24);
    assert.equal(windows.current.end, '2026-08-02T20:00:00-07:00');
    assert.equal(windows.current.start, '2026-08-01T21:00:00-07:00');
    assert.equal(windows.previous.end, '2026-08-01T20:00:00-07:00');
    assert.equal(windows.previous.start, '2026-07-31T21:00:00-07:00');
  });

  it('fills missing hours with zeros', () => {
    const windows = buildLatestHourlyWindows(
      [
        hour('2026-08-02T10:00:00-07:00', 5, 50, 2),
        hour('2026-08-02T12:00:00-07:00', 7, 70, 3),
      ],
      24
    );

    assert.equal(windows.current.rows.length, 24);
    const missing = windows.current.rows.find((row) => row.hour === '2026-08-02T11:00:00-07:00');
    assert.ok(missing);
    assert.equal(missing?.clicks, 0);
    assert.equal(missing?.impressions, 0);
    assert.equal(missing?.position, 0);
  });

  it('crosses midnight and month boundaries', () => {
    const windows = buildLatestHourlyWindows(
      [hour('2026-08-01T00:00:00-07:00', 1, 1, 1), hour('2026-08-01T02:00:00-07:00', 2, 2, 2)],
      24
    );
    assert.equal(windows.current.end, '2026-08-01T02:00:00-07:00');
    assert.equal(windows.current.start, '2026-07-31T03:00:00-07:00');
    assert.equal(windows.previous.end, '2026-07-31T02:00:00-07:00');
  });

  it('handles DST spring forward (America/Los_Angeles)', () => {
    // 2026-03-08: clocks jump 02:00 → 03:00 PDT. Offsets change -08:00 → -07:00.
    const rows = [
      hour('2026-03-08T00:00:00-08:00', 1, 10, 1),
      hour('2026-03-08T01:00:00-08:00', 2, 20, 2),
      hour('2026-03-08T03:00:00-07:00', 3, 30, 3),
      hour('2026-03-08T04:00:00-07:00', 4, 40, 4),
    ];
    const windows = buildLatestHourlyWindows(rows, 4);
    assert.equal(windows.current.rows.length, 4);
    assert.equal(windows.latestAvailableHour, '2026-03-08T04:00:00-07:00');
    // Continuous timeline by absolute ms: 4 hours ending at 04:00-07:00.
    assert.equal(windows.current.end, '2026-03-08T04:00:00-07:00');
  });

  it('handles DST fall back (America/Los_Angeles)', () => {
    // Ambiguous 01:00 occurs twice; keys keep distinct offsets.
    const rows = [
      hour('2026-11-01T00:00:00-07:00', 1, 10, 1),
      hour('2026-11-01T01:00:00-07:00', 2, 20, 2),
      hour('2026-11-01T01:00:00-08:00', 3, 30, 3),
      hour('2026-11-01T02:00:00-08:00', 4, 40, 4),
    ];
    const windows = buildLatestHourlyWindows(rows, 4);
    assert.equal(windows.current.rows.length, 4);
    assert.equal(windows.latestAvailableHour, '2026-11-01T02:00:00-08:00');
    assert.deepEqual(
      windows.current.rows.map((row) => row.hour),
      [
        '2026-11-01T00:00:00-07:00',
        '2026-11-01T01:00:00-07:00',
        '2026-11-01T01:00:00-08:00',
        '2026-11-01T02:00:00-08:00',
      ]
    );
  });

  it('uses a shared latestAvailableHour anchor', () => {
    const rows = [hour('2026-08-02T14:00:00-07:00', 9, 90, 4)];
    const windows = buildLatestHourlyWindows(rows, 24);
    assert.equal(windows.latestAvailableHour, '2026-08-02T14:00:00-07:00');
    assert.equal(windows.current.end, windows.latestAvailableHour);
  });

  it('handles empty API response', () => {
    const windows = buildLatestHourlyWindows([], 24);
    assert.equal(windows.latestAvailableHour, null);
    assert.equal(windows.current.rows.length, 0);
    assert.equal(windows.previous.rows.length, 0);
  });

  it('handles a single hourly row by zero-filling the rest', () => {
    const windows = buildLatestHourlyWindows([hour('2026-08-02T14:00:00-07:00', 11, 110, 6)], 24);
    assert.equal(windows.current.rows.length, 24);
    const totals = summarizeHourWindow(windows.current);
    assert.equal(totals.clicks, 11);
    assert.equal(totals.impressions, 110);
  });
});

describe('hourly-ranges aggregation', () => {
  const currentWindow = buildLatestHourlyWindows(
    [
      hour('2026-08-02T13:00:00-07:00', 0, 0, 0),
      hour('2026-08-02T14:00:00-07:00', 0, 0, 0),
    ],
    2
  ).current;

  it('sums clicks/impressions and weights position; drops out-of-window rows', () => {
    const detail = normalizeDetailHourRows([
      { keys: ['2026-08-02T14:00:00-07:00', 'casino'], clicks: 2, impressions: 10, position: 4 },
      { keys: ['2026-08-02T13:00:00-07:00', 'casino'], clicks: 3, impressions: 30, position: 8 },
      { keys: ['2026-08-02T12:00:00-07:00', 'casino'], clicks: 100, impressions: 1000, position: 1 },
      { keys: ['2026-08-02T14:00:00-07:00', 'bonus'], clicks: 1, impressions: 5, position: 2 },
    ]);

    const aggregated = aggregateDetailRowsForWindow(detail, currentWindow);
    const casino = aggregated.find((row) => row.key === 'casino');
    assert.ok(casino);
    assert.equal(casino?.clicks, 5);
    assert.equal(casino?.impressions, 40);
    assert.equal(Number(casino?.position.toFixed(4)), Number(((4 * 10 + 8 * 30) / 40).toFixed(4)));
    assert.equal(
      aggregated.some((row) => row.clicks === 100),
      false
    );
  });

  it('does not mix current and previous windows', () => {
    const windows = buildLatestHourlyWindows(
      [hour('2026-08-02T14:00:00-07:00', 0, 0, 0), hour('2026-08-02T13:00:00-07:00', 0, 0, 0)],
      1
    );
    const detail = normalizeDetailHourRows([
      { keys: ['2026-08-02T14:00:00-07:00', 'a'], clicks: 5, impressions: 50, position: 3 },
      { keys: ['2026-08-02T13:00:00-07:00', 'a'], clicks: 7, impressions: 70, position: 9 },
    ]);

    const current = aggregateDetailRowsForWindow(detail, windows.current);
    const previous = aggregateDetailRowsForWindow(detail, windows.previous);
    assert.equal(current[0]?.clicks, 5);
    assert.equal(previous[0]?.clicks, 7);
    assert.equal(hourInWindow('2026-08-02T13:00:00-07:00', windows.current), false);

    const enriched = enrichAggregatedRows(current, previous);
    assert.equal(enriched[0]?.previousClicks, 7);
  });

  it('aggregates query/page/country/device keys the same way', () => {
    for (const key of ['query-one', '/page', 'fra', 'MOBILE']) {
      const detail = normalizeDetailHourRows([
        { keys: ['2026-08-02T14:00:00-07:00', key], clicks: 1, impressions: 2, position: 5 },
        { keys: ['2026-08-02T13:00:00-07:00', key], clicks: 1, impressions: 2, position: 7 },
      ]);
      const aggregated = aggregateDetailRowsForWindow(detail, currentWindow);
      assert.equal(aggregated[0]?.key, key);
      assert.equal(aggregated[0]?.clicks, 2);
      assert.equal(aggregated[0]?.impressions, 4);
    }
  });
});

function synthesizePacific(ms: number): string {
  // Format instant as America/Los_Angeles wall clock with numeric offset.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  const asUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')),
    Number(get('minute')),
    Number(get('second'))
  );
  const offsetMinutes = Math.round((asUtc - ms) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const oh = String(Math.floor(abs / 60)).padStart(2, '0');
  const om = String(abs % 60).padStart(2, '0');
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:00:00${sign}${oh}:${om}`;
}
