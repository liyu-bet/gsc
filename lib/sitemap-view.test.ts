import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveSitemapStatus,
  formatSitemapDate,
  sortSitemapViewModels,
  sumSubmittedUrls,
  toSitemapViewModel,
  type SitemapViewModel,
} from './sitemap-view';

describe('sitemap-view', () => {
  it('derives status with correct priority', () => {
    assert.equal(deriveSitemapStatus({ errors: 1, warnings: 9, isPending: true }), 'error');
    assert.equal(deriveSitemapStatus({ errors: 0, warnings: 1, isPending: true }), 'pending');
    assert.equal(deriveSitemapStatus({ errors: 0, warnings: 2, isPending: false }), 'warning');
    assert.equal(deriveSitemapStatus({ errors: 0, warnings: 0, isPending: false }), 'success');
  });

  it('sums submitted counts from string/number and ignores indexed', () => {
    assert.equal(
      sumSubmittedUrls([
        { submitted: '10', indexed: '999' },
        { submitted: 5, indexed: 1 },
        { submitted: 'nope' },
      ]),
      15
    );
  });

  it('invalid counts become zero', () => {
    const view = toSitemapViewModel({
      path: 'https://example.com/sitemap.xml',
      warnings: 'bad',
      errors: Number.NaN,
      contents: [{ submitted: 'x' }],
    });
    assert.equal(view.warnings, 0);
    assert.equal(view.errors, 0);
    assert.equal(view.submittedUrlCount, 0);
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
