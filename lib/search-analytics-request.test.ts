import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDailyRequest,
  buildHourlyDetailRequest,
  buildHourlyTotalsRequest,
} from './search-analytics-request';

describe('search-analytics-request', () => {
  it('builds hourly totals with hourly_all and hour dimension', () => {
    const body = buildHourlyTotalsRequest({
      startDate: '2026-07-30',
      endDate: '2026-08-02',
      searchType: 'web',
    });
    assert.equal(body.dataState, 'hourly_all');
    assert.deepEqual(body.dimensions, ['hour']);
    assert.equal(body.aggregationType, 'byProperty');
    assert.equal(body.rowLimit, 250);
  });

  it('uses auto aggregation when page filter is active', () => {
    const body = buildHourlyTotalsRequest({
      startDate: '2026-07-30',
      endDate: '2026-08-02',
      searchType: 'web',
      filters: { page: 'https://example.com/' },
    });
    assert.equal(body.aggregationType, 'auto');
  });

  it('builds hourly detail requests with hour + secondary dimension', () => {
    const body = buildHourlyDetailRequest({
      startDate: '2026-07-30',
      endDate: '2026-08-02',
      secondaryDimension: 'query',
      searchType: 'web',
    });
    assert.equal(body.dataState, 'hourly_all');
    assert.deepEqual(body.dimensions, ['hour', 'query']);
  });

  it('keeps daily totals on dataState all + date dimension', () => {
    const body = buildDailyRequest({
      startDate: '2026-07-01',
      endDate: '2026-07-28',
      dimensions: ['date'],
      rowLimit: 400,
      searchType: 'web',
    });
    assert.equal(body.dataState, 'all');
    assert.deepEqual(body.dimensions, ['date']);
    assert.equal('aggregationType' in body && body.aggregationType, false);
  });
});
