import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveSitemapStatus,
  formatBigIntCount,
  formatSitemapDate,
  parseInt64Count,
  sortSitemapViewModels,
  sumSubmittedUrls,
  toSitemapViewModel,
  type SitemapViewModel,
} from './sitemap-view';

describe('sitemap-view', () => {
  it('derives status with correct priority', () => {
    assert.equal(
      deriveSitemapStatus({
        errorsGreaterThanZero: true,
        warningsGreaterThanZero: true,
        isPending: true,
      }),
      'error'
    );
    assert.equal(
      deriveSitemapStatus({
        errorsGreaterThanZero: false,
        warningsGreaterThanZero: true,
        isPending: true,
      }),
      'pending'
    );
    assert.equal(
      deriveSitemapStatus({
        errorsGreaterThanZero: false,
        warningsGreaterThanZero: true,
        isPending: false,
      }),
      'warning'
    );
    assert.equal(
      deriveSitemapStatus({
        errorsGreaterThanZero: false,
        warningsGreaterThanZero: false,
        isPending: false,
      }),
      'success'
    );
  });

  it('sums submitted counts with BigInt and ignores indexed', () => {
    assert.equal(
      sumSubmittedUrls([
        { submitted: '10', indexed: '999' },
        { submitted: 5, indexed: 1 },
        { submitted: 'nope' },
      ]),
      15n
    );
  });

  it('preserves unsafe int64 string exactly', () => {
    const huge = '9007199254740993';
    assert.equal(parseInt64Count(huge).toString(), huge);
    assert.equal(formatBigIntCount(parseInt64Count(huge)).replace(/\u00a0/g, ''), huge);
  });

  it('invalid counts become zero labels', () => {
    const view = toSitemapViewModel({
      path: 'https://example.com/sitemap.xml',
      warnings: 'bad',
      errors: Number.NaN,
      contents: [{ submitted: 'x' }],
    });
    assert.equal(view.warningsGreaterThanZero, false);
    assert.equal(view.errorsGreaterThanZero, false);
    assert.equal(view.submittedUrlCountLabel, '0');
    assert.equal(view.status, 'success');
  });

  it('formats invalid dates safely', () => {
    assert.equal(formatSitemapDate('not-a-date'), '—');
    assert.equal(formatSitemapDate(undefined), '—');
  });

  it('sorts deterministically by status then lastSubmitted then path', () => {
    const rows: SitemapViewModel[] = [
      toSitemapViewModel({
        path: 'https://b.example/sitemap.xml',
        lastSubmitted: '2024-01-01T00:00:00.000Z',
      }),
      toSitemapViewModel({
        path: 'https://a.example/sitemap.xml',
        errors: 1,
        lastSubmitted: '2023-01-01T00:00:00.000Z',
      }),
      toSitemapViewModel({
        path: 'https://c.example/sitemap.xml',
        warnings: 1,
        lastSubmitted: '2025-01-01T00:00:00.000Z',
      }),
      toSitemapViewModel({
        path: 'https://d.example/sitemap.xml',
        isPending: true,
        lastSubmitted: '2022-01-01T00:00:00.000Z',
      }),
    ];
    const sorted = sortSitemapViewModels(rows);
    assert.deepEqual(
      sorted.map((r) => r.status),
      ['error', 'warning', 'pending', 'success']
    );
  });
});
