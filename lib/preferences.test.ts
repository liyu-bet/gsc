import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPresetPeriod,
  clearDimensionFilters,
  mergePreferenceParams,
  scrubLegacyDatePreferences,
} from './preferences';

describe('preferences', () => {
  it('scrubs legacy startDate/endDate/customOpen', () => {
    assert.deepEqual(
      scrubLegacyDatePreferences({
        period: '28d',
        startDate: '2026-01-01',
        endDate: '2026-01-10',
        customOpen: '1',
        searchType: 'web',
      }),
      { period: '28d', searchType: 'web' }
    );
  });

  it('gives URL priority over localStorage and never restores dates', () => {
    const merged = mergePreferenceParams({
      url: { period: '24h' },
      stored: {
        period: 'custom',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        searchType: 'image',
      },
      allowedKeys: ['period', 'searchType', 'startDate', 'endDate'],
    });
    assert.equal(merged.period, '24h');
    assert.equal(merged.searchType, 'image');
    assert.equal(merged.startDate, undefined);
    assert.equal(merged.endDate, undefined);
  });

  it('does not restore period over an explicit legacy range', () => {
    const merged = mergePreferenceParams({
      url: { range: '28' },
      stored: { period: '24h', searchType: 'web' },
      allowedKeys: ['period', 'searchType'],
    });
    assert.equal(merged.period, undefined);
    assert.equal(merged.searchType, 'web');
  });

  it('preset clears startDate/endDate', () => {
    assert.deepEqual(applyPresetPeriod('24h'), {
      period: '24h',
      range: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  });

  it('clear filters keeps period/searchType', () => {
    assert.deepEqual(
      clearDimensionFilters({
        period: '24h',
        searchType: 'web',
        query: 'x',
        page: 'y',
        country: 'fra',
        device: 'MOBILE',
      }),
      { period: '24h', searchType: 'web' }
    );
  });
});
