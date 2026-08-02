import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countDeltaClass,
  formatCountDelta,
  metricDelta,
  positionImprovement,
  summarizeMetricRows,
  weightedAveragePosition,
} from './metrics';

describe('metrics', () => {
  it('sums clicks and impressions', () => {
    const totals = summarizeMetricRows([
      { clicks: 2, impressions: 10, position: 1 },
      { clicks: 3, impressions: 5, position: 4 },
    ]);
    assert.equal(totals.clicks, 5);
    assert.equal(totals.impressions, 15);
  });

  it('computes impression-weighted position', () => {
    const position = weightedAveragePosition([
      { impressions: 10, position: 1 },
      { impressions: 90, position: 10 },
    ]);
    assert.equal(position, 9.1);
  });

  it('returns zero position when impressions are zero', () => {
    assert.equal(weightedAveragePosition([{ impressions: 0, position: 4 }]), 0);
    assert.equal(summarizeMetricRows([{ clicks: 1, impressions: 0, position: 8 }]).position, 0);
  });

  it('treats undefined/null metric values as zero', () => {
    const totals = summarizeMetricRows([
      { clicks: null, impressions: undefined, position: null },
      { clicks: 4, impressions: 8, position: 2 },
    ]);
    assert.deepEqual(totals, { clicks: 4, impressions: 8, position: 2 });
  });

  it('handles empty rows', () => {
    assert.deepEqual(summarizeMetricRows([]), { clicks: 0, impressions: 0, position: 0 });
  });

  it('computes metric delta and percent', () => {
    assert.deepEqual(metricDelta(120, 100), {
      current: 120,
      previous: 100,
      delta: 20,
      deltaPct: 20,
    });
  });

  it('handles previous=0 for metric delta', () => {
    assert.deepEqual(metricDelta(5, 0), {
      current: 5,
      previous: 0,
      delta: 5,
      deltaPct: 100,
    });
  });

  it('handles current=0 and previous=0', () => {
    assert.deepEqual(metricDelta(0, 0), {
      current: 0,
      previous: 0,
      delta: 0,
      deltaPct: 0,
    });
  });

  it('formats ranking count deltas', () => {
    assert.equal(formatCountDelta(184 - 161, 'query', 'queries'), '+23 queries');
    assert.equal(formatCountDelta(52 - 56, 'page', 'pages'), '-4 pages');
    assert.equal(formatCountDelta(1, 'query', 'queries'), '+1 query');
    assert.equal(formatCountDelta(2, 'query', 'queries'), '+2 queries');
    assert.equal(formatCountDelta(1, 'page', 'pages'), '+1 page');
    assert.equal(formatCountDelta(2, 'page', 'pages'), '+2 pages');
    assert.equal(formatCountDelta(0, 'query', 'queries'), '0 queries');
    assert.equal(countDeltaClass(23), 'good');
    assert.equal(countDeltaClass(-4), 'bad');
  });

  it('treats lower position as an improvement', () => {
    assert.equal(positionImprovement(7, 10), 3);
    assert.equal(positionImprovement(10, 7), -3);
  });
});
