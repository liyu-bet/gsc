import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateDetailRowsForWindow,
  buildHourlyWindowsAtAnchor,
  buildLatestHourlyWindows,
  chooseCommonHourlyAnchor,
  compareHourKeys,
  dimensionCountDelta,
  enrichAggregatedRows,
  formatPacificHourKey,
  hourInWindow,
  normalizeDetailHourRows,
  normalizeHourlyRows,
  parseHourMs,
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

  it('counts previous keys that are missing from current independently', () => {
    const previous = ['alpha', 'beta', 'gamma'];
    const current = ['alpha', 'delta'];
    assert.deepEqual(dimensionCountDelta(current.length, previous.length), {
      current: 2,
      previous: 3,
      delta: -1,
    });
  });
});

describe('portfolio common anchor', () => {
  it('chooses the minimum latestAvailableHour across sites', () => {
    assert.equal(
      chooseCommonHourlyAnchor(['2026-08-02T14:00:00-07:00', '2026-08-02T12:00:00-07:00']),
      '2026-08-02T12:00:00-07:00'
    );
  });

  it('builds both site windows ending at the common anchor', () => {
    const commonAnchor = chooseCommonHourlyAnchor([
      '2026-08-02T14:00:00-07:00',
      '2026-08-02T12:00:00-07:00',
    ]);
    assert.equal(commonAnchor, '2026-08-02T12:00:00-07:00');

    const siteA = buildHourlyWindowsAtAnchor(
      [hour('2026-08-02T14:00:00-07:00', 9, 90, 4), hour('2026-08-02T12:00:00-07:00', 3, 30, 2)],
      commonAnchor!,
      24
    );
    const siteB = buildHourlyWindowsAtAnchor(
      [hour('2026-08-02T12:00:00-07:00', 5, 50, 3)],
      commonAnchor!,
      24
    );

    assert.equal(siteA.current.end, '2026-08-02T12:00:00-07:00');
    assert.equal(siteB.current.end, '2026-08-02T12:00:00-07:00');
    assert.equal(siteA.current.rows.length, 24);
    assert.equal(siteB.current.rows.length, 24);
    // Site A data after the common anchor is ignored for the shared window end.
    assert.equal(siteA.current.rows[siteA.current.rows.length - 1]?.clicks, 3);
  });
});

describe('DST-safe synthetic hour keys', () => {
  it('uses PDT offset after spring forward', () => {
    // 2026-03-08 10:00 UTC = 02:00 PST; 11:00 UTC = 04:00 PDT (02:00-03:00 skipped).
    const before = formatPacificHourKey(Date.parse('2026-03-08T09:00:00.000Z')); // 01:00-08:00
    const after = formatPacificHourKey(Date.parse('2026-03-08T11:00:00.000Z')); // 04:00-07:00
    assert.equal(before, '2026-03-08T01:00:00-08:00');
    assert.equal(after, '2026-03-08T04:00:00-07:00');
  });

  it('uses PST offset after fall back', () => {
    const pdt = formatPacificHourKey(Date.parse('2026-11-01T08:00:00.000Z')); // 01:00 PDT
    const pst = formatPacificHourKey(Date.parse('2026-11-01T09:00:00.000Z')); // 01:00 PST
    assert.equal(pdt, '2026-11-01T01:00:00-07:00');
    assert.equal(pst, '2026-11-01T01:00:00-08:00');
    assert.notEqual(pdt, pst);
  });

  it('fills a missing DST-boundary hour with the correct Pacific offset', () => {
    // Anchor after spring forward; leave the jump hour missing in source rows.
    const rows = [
      hour('2026-03-08T00:00:00-08:00', 1, 10, 1),
      hour('2026-03-08T01:00:00-08:00', 2, 20, 2),
      hour('2026-03-08T04:00:00-07:00', 4, 40, 4),
    ];
    const windows = buildLatestHourlyWindows(rows, 4);
    assert.equal(windows.current.rows.length, 4);
    const keys = windows.current.rows.map((row) => row.hour);
    assert.deepEqual(new Set(keys).size, keys.length);
    // Absolute step between consecutive keys is exactly one hour.
    for (let i = 1; i < keys.length; i += 1) {
      assert.equal(parseHourMs(keys[i]!)! - parseHourMs(keys[i - 1]!)!, 3_600_000);
    }
  });

  it('keeps unique ISO keys across a filled fall-back window', () => {
    const anchor = '2026-11-01T02:00:00-08:00';
    const windows = buildHourlyWindowsAtAnchor(
      [
        hour('2026-11-01T00:00:00-07:00', 1, 1, 1),
        hour('2026-11-01T02:00:00-08:00', 4, 4, 4),
      ],
      anchor,
      4
    );
    const keys = windows.current.rows.map((row) => row.hour);
    assert.equal(new Set(keys).size, 4);
    for (let i = 1; i < keys.length; i += 1) {
      assert.equal(parseHourMs(keys[i]!)! - parseHourMs(keys[i - 1]!)!, 3_600_000);
    }
  });
});

function synthesizePacific(ms: number): string {
  return formatPacificHourKey(ms);
}
