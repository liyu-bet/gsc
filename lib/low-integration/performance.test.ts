import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GoogleApiError } from '../google-errors';
import {
  buildLatestDaySearchAnalyticsBody,
  calculatePropertyPerformance,
  resolveExpectedFinalizedGscDate,
  resolveLatestAvailableDay,
  sumSearchAnalyticsTotals,
} from './performance';

describe('LOW M2M performance helpers', () => {
  it('sums totals from Search Analytics payload without clamping', () => {
    const totals = sumSearchAnalyticsTotals({
      rows: [
        { clicks: 2, impressions: 10 },
        { clicks: 3, impressions: 5 },
      ],
    });
    assert.deepEqual(totals, { clicks: 5, impressions: 15 });
  });

  it('preserves clicks greater than impressions from upstream', () => {
    const totals = sumSearchAnalyticsTotals({
      rows: [{ clicks: 9, impressions: 3 }],
    });
    assert.equal(totals.clicks, 9);
    assert.equal(totals.impressions, 3);
  });

  it('rejects invalid payloads with GoogleApiError', () => {
    assert.throws(
      () => sumSearchAnalyticsTotals({ rows: 'bad' }),
      (error: unknown) => error instanceof GoogleApiError && error.code === 'INVALID_RESPONSE'
    );
  });

  it('rejects NaN/Infinity/negative metrics', () => {
    assert.throws(() => sumSearchAnalyticsTotals({ rows: [{ clicks: Number.NaN, impressions: 1 }] }));
    assert.throws(() => sumSearchAnalyticsTotals({ rows: [{ clicks: 1, impressions: Number.POSITIVE_INFINITY }] }));
    assert.throws(() => sumSearchAnalyticsTotals({ rows: [{ clicks: -1, impressions: 1 }] }));
  });

  it('zero rows yield zeros', () => {
    assert.deepEqual(sumSearchAnalyticsTotals({ rows: [] }), { clicks: 0, impressions: 0 });
    assert.deepEqual(sumSearchAnalyticsTotals({}), { clicks: 0, impressions: 0 });
  });

  it('resolves Pacific today−2 using injected now', () => {
    // 2026-08-04 12:00 UTC ≈ Pacific afternoon Aug 4 → finalized Aug 2
    assert.equal(
      resolveExpectedFinalizedGscDate(new Date('2026-08-04T12:00:00.000Z')),
      '2026-08-02'
    );
    // Just after Pacific midnight on Aug 5 (2026-08-05T07:30Z PDT)
    assert.equal(
      resolveExpectedFinalizedGscDate(new Date('2026-08-05T07:30:00.000Z')),
      '2026-08-03'
    );
    // Before Pacific midnight still Aug 4
    assert.equal(
      resolveExpectedFinalizedGscDate(new Date('2026-08-05T06:30:00.000Z')),
      '2026-08-02'
    );
    assert.equal(resolveLatestAvailableDay(new Date('2026-08-04T12:00:00.000Z')), '2026-08-02');
  });

  it('handles month and year boundaries in Pacific', () => {
    assert.equal(
      resolveExpectedFinalizedGscDate(new Date('2026-03-02T12:00:00.000Z')),
      '2026-02-28'
    );
    assert.equal(
      resolveExpectedFinalizedGscDate(new Date('2026-01-02T12:00:00.000Z')),
      '2025-12-31'
    );
  });

  it('builds property-level latest_day query body', () => {
    const body = buildLatestDaySearchAnalyticsBody('2026-08-02');
    assert.equal(body.startDate, '2026-08-02');
    assert.equal(body.endDate, '2026-08-02');
    assert.equal(body.dataState, 'final');
    assert.equal(body.rowLimit, 1);
    assert.equal(body.aggregationType, 'byProperty');
    assert.deepEqual(body.dimensions, []);
    assert.equal('query' in body, false);
  });

  it('calculatePropertyPerformance uses Pacific date and query body', async () => {
    let seenBody: Record<string, unknown> | null = null;
    const result = await calculatePropertyPerformance({
      propertyId: 'prop_1',
      siteUrl: 'sc-domain:example.com',
      connectionId: 'conn_1',
      now: new Date('2026-08-04T12:00:00.000Z'),
      queryFn: async (_c, _s, body) => {
        seenBody = body as Record<string, unknown>;
        return { rows: [{ clicks: 12, impressions: 840 }] };
      },
    });

    assert.equal(result.dataDate, '2026-08-02');
    assert.equal(result.clicks, 12);
    assert.equal(result.impressions, 840);
    assert.equal(seenBody?.rowLimit, 1);
    assert.deepEqual(seenBody?.dimensions, []);
    assert.equal(seenBody?.dataState, 'final');
  });
});
