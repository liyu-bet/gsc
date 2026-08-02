import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePeriodParams, periodToQueryParams } from './periods';

describe('periods', () => {
  it('maps period=24h and legacy range=1 to hourly mode', () => {
    assert.deepEqual(parsePeriodParams({ period: '24h' }), {
      id: '24h',
      mode: 'hourly',
      compareDefault: false,
    });
    assert.deepEqual(parsePeriodParams({ range: '1' }), {
      id: '24h',
      mode: 'hourly',
      compareDefault: false,
    });
  });

  it('maps daily presets and custom mode', () => {
    assert.equal(parsePeriodParams({ period: '28d' }).mode, 'daily');
    assert.equal(parsePeriodParams({ period: '90d', range: '7' }).id, '90d');
    assert.deepEqual(parsePeriodParams({ period: 'custom', startDate: '2026-07-01', endDate: '2026-07-10' }), {
      id: 'custom',
      mode: 'custom',
      compareDefault: true,
    });
  });

  it('requires both custom dates for custom mode without period', () => {
    assert.equal(parsePeriodParams({ startDate: '2026-07-01' }).mode, 'daily');
    assert.equal(
      parsePeriodParams({ startDate: '2026-07-01', endDate: '2026-07-10' }).mode,
      'custom'
    );
  });

  it('periodToQueryParams clears start/end for presets', () => {
    assert.deepEqual(periodToQueryParams({ id: '24h', mode: 'hourly', compareDefault: false }), {
      period: '24h',
      range: undefined,
      startDate: undefined,
      endDate: undefined,
    });
    assert.deepEqual(
      periodToQueryParams(
        { id: 'custom', mode: 'custom', compareDefault: true },
        { startDate: '2026-07-01', endDate: '2026-07-03' }
      ),
      {
        period: 'custom',
        range: undefined,
        startDate: '2026-07-01',
        endDate: '2026-07-03',
      }
    );
  });
});
