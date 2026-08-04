import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeBulkRetryResults,
  remainingBulkIds,
  type BulkSitemapResultRow,
} from './bulk-sitemap-results';
import { createOperationLock, runWithOperationLock } from './operation-lock';

function row(
  id: string,
  status: BulkSitemapResultRow['status'],
  message?: string
): BulkSitemapResultRow {
  return {
    propertyId: id,
    siteUrl: `https://${id}.example/`,
    sitemapUrl: status === 'failed' ? null : `https://${id}.example/sitemap.xml`,
    status,
    message,
  };
}

describe('mergeBulkRetryResults', () => {
  const order = ['a', 'b', 'c'];

  it('replaces failed with submitted and keeps success/skipped', () => {
    const previous = [row('a', 'submitted'), row('b', 'failed'), row('c', 'skipped')];
    const retry = [row('b', 'submitted')];
    const merged = mergeBulkRetryResults(previous, retry, order);
    assert.deepEqual(
      merged.map((r) => `${r.propertyId}:${r.status}`),
      ['a:submitted', 'b:submitted', 'c:skipped']
    );
  });

  it('keeps failed when retry fails again', () => {
    const previous = [row('a', 'failed', 'old')];
    const retry = [row('a', 'failed', 'new')];
    const merged = mergeBulkRetryResults(previous, retry, ['a']);
    assert.equal(merged[0].message, 'new');
  });

  it('preserves submitted and skipped across retries', () => {
    const previous = [row('a', 'submitted'), row('b', 'skipped'), row('c', 'failed')];
    const merged = mergeBulkRetryResults(previous, [row('c', 'failed')], order);
    assert.equal(merged.find((r) => r.propertyId === 'a')?.status, 'submitted');
    assert.equal(merged.find((r) => r.propertyId === 'b')?.status, 'skipped');
  });

  it('has no duplicates and deterministic order', () => {
    const previous = [row('c', 'failed'), row('a', 'submitted')];
    const merged = mergeBulkRetryResults(previous, [row('c', 'submitted'), row('z', 'failed')], order);
    assert.deepEqual(
      merged.map((r) => r.propertyId),
      ['a', 'c', 'z']
    );
    assert.equal(new Set(merged.map((r) => r.propertyId)).size, merged.length);
  });
});

describe('remainingBulkIds', () => {
  it('excludes attempted IDs only', () => {
    assert.deepEqual(remainingBulkIds(['a', 'b', 'c'], ['a']), ['b', 'c']);
  });
});

describe('operation-lock', () => {
  it('allows only one concurrent run', async () => {
    const lock = createOperationLock();
    let started = 0;
    let finished = 0;

    const first = runWithOperationLock(lock, async () => {
      started += 1;
      await new Promise((r) => setTimeout(r, 30));
      finished += 1;
      return 'a';
    });
    const second = runWithOperationLock(lock, async () => {
      started += 1;
      finished += 1;
      return 'b';
    });

    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.ran, true);
    assert.equal(b.ran, false);
    assert.equal(started, 1);
    assert.equal(finished, 1);

    const third = await runWithOperationLock(lock, async () => 'c');
    assert.equal(third.ran, true);
  });
});
