import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildComparisonRange,
  buildCustomComparisonRange,
  differenceInCalendarDaysInclusive,
  gscCalendarDate,
  normalizeGscDate,
  parseAllowedRange,
} from './date-ranges';

describe('date-ranges', () => {
  it('parses exact allowed range 1', () => {
    assert.equal(parseAllowedRange('1'), 1);
    assert.equal(parseAllowedRange(1), 1);
  });

  it('returns fallback for invalid ranges', () => {
    assert.equal(parseAllowedRange('5', 90), 90);
    assert.equal(parseAllowedRange(undefined, 28), 28);
    assert.equal(parseAllowedRange('abc', 14), 14);
    assert.equal(parseAllowedRange(7.5, 90), 90);
  });

  it('builds a one-day comparison range', () => {
    assert.deepEqual(buildComparisonRange(1, '2026-08-02'), {
      startDate: '2026-08-02',
      endDate: '2026-08-02',
      previousStartDate: '2026-08-01',
      previousEndDate: '2026-08-01',
    });
  });

  it('builds a 7-day range with exactly 7 inclusive days', () => {
    const range = buildComparisonRange(7, '2026-08-07');
    assert.equal(differenceInCalendarDaysInclusive(range.startDate, range.endDate), 7);
    assert.deepEqual(range, {
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      previousStartDate: '2026-07-25',
      previousEndDate: '2026-07-31',
    });
  });

  it('places previous range immediately before current range', () => {
    const range = buildComparisonRange(14, '2026-03-20');
    assert.equal(range.previousEndDate, '2026-03-06');
    assert.equal(range.startDate, '2026-03-07');
  });

  it('crosses month boundaries correctly', () => {
    assert.deepEqual(buildComparisonRange(3, '2026-03-01'), {
      startDate: '2026-02-27',
      endDate: '2026-03-01',
      previousStartDate: '2026-02-24',
      previousEndDate: '2026-02-26',
    });
  });

  it('crosses year boundaries correctly', () => {
    assert.deepEqual(buildComparisonRange(2, '2026-01-01'), {
      startDate: '2025-12-31',
      endDate: '2026-01-01',
      previousStartDate: '2025-12-29',
      previousEndDate: '2025-12-30',
    });
  });

  it('handles leap year February', () => {
    assert.deepEqual(buildComparisonRange(3, '2024-03-01'), {
      startDate: '2024-02-28',
      endDate: '2024-03-01',
      previousStartDate: '2024-02-25',
      previousEndDate: '2024-02-27',
    });
  });

  it('formats GSC calendar date in America/Los_Angeles', () => {
    // 01:00 UTC on Aug 3 is still Aug 2 in Pacific Daylight Time.
    assert.equal(gscCalendarDate(new Date('2026-08-03T01:00:00.000Z')), '2026-08-02');
  });

  it('keeps Pacific date when UTC already rolled to next day', () => {
    assert.equal(gscCalendarDate(new Date('2026-01-02T07:30:00.000Z')), '2026-01-01');
  });

  it('normalizes invalid custom dates to fallback', () => {
    assert.equal(normalizeGscDate('2026-13-40', '2026-08-02'), '2026-08-02');
    assert.equal(normalizeGscDate(undefined, '2026-08-02'), '2026-08-02');
    assert.equal(normalizeGscDate('2026-08-02', '2026-01-01'), '2026-08-02');
    assert.equal(normalizeGscDate('2024-02-30', '2026-08-02'), '2026-08-02');
  });

  it('builds custom comparison ranges of equal length', () => {
    assert.deepEqual(buildCustomComparisonRange('2026-08-01', '2026-08-03'), {
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      previousStartDate: '2026-07-29',
      previousEndDate: '2026-07-31',
    });
    assert.equal(buildCustomComparisonRange('bad', '2026-08-03'), null);
  });
});
