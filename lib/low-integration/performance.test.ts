import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveLatestAvailableDay,
  sumSearchAnalyticsTotals,
  calculatePropertyPerformance,
} from './performance';

describe('LOW M2M performance helpers', () => {
  it('sums totals from Search Analytics payload', () => {
    const totals = sumSearchAnalyticsTotals({
      rows: [
        { clicks: 2, impressions: 10 },
        { clicks: 3, impressions: 5 },
      ],
    });
    assert.deepEqual(totals, { clicks: 5, impressions: 15 });
  });

  it('rejects invalid payloads', () => {
    assert.throws(() => sumSearchAnalyticsTotals({ rows: 'bad' }), /Invalid Search Console/);
  });

  it('caps clicks at impressions', () => {
    const totals = sumSearchAnalyticsTotals({
      rows: [{ clicks: 9, impressions: 3 }],
    });
    assert.equal(totals.clicks, 3);
    assert.equal(totals.impressions, 3);
  });

  it('returns latest_available_day response via calculatePropertyPerformance', async () => {
    const result = await calculatePropertyPerformance({
      propertyId: 'prop_1',
      siteUrl: 'sc-domain:example.com',
      connectionId: 'conn_1',
      now: new Date('2026-08-04T12:00:00.000Z'),
      queryFn: async () => ({ rows: [{ clicks: 12, impressions: 840 }] }),
    });

    assert.equal(result.period, 'latest_available_day');
    assert.equal(result.clicks, 12);
    assert.equal(result.impressions, 840);
    assert.equal(result.periodStart, result.dataDate);
    assert.equal(result.periodEnd, result.dataDate);
    assert.match(result.dataDate ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof resolveLatestAvailableDay(), 'string');
  });
});
