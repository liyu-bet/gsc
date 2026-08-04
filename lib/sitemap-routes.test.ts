import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('sitemap submit route contracts', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'app/api/sites/[id]/sitemaps/submit/route.ts'),
    'utf8'
  );

  it('requires session, same-origin, and loads property by id', () => {
    assert.match(source, /auth\.getSession\(/);
    assert.match(source, /assertSameOriginRequest/);
    assert.match(source, /gscProperty\.findUnique/);
    assert.match(source, /status:\s*401/);
    assert.match(source, /status:\s*404/);
    assert.match(source, /status:\s*409/);
  });

  it('does not trust client siteUrl or connectionId', () => {
    assert.doesNotMatch(source, /payload\.siteUrl/);
    assert.doesNotMatch(source, /payload\.connectionId/);
    assert.match(source, /resolveSitemapUrl\(property\.siteUrl/);
    assert.match(source, /submitSitemap\(property\.connectionId/);
  });

  it('returns safe JSON shape without secret fields', () => {
    assert.match(source, /assertNoSecretsInJson/);
    assert.doesNotMatch(source, /encryptedAccess/);
    assert.doesNotMatch(source, /encryptedRefresh/);
  });
});

describe('sitemap bulk-submit route contracts', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'app/api/sitemaps/bulk-submit/route.ts'),
    'utf8'
  );

  it('enforces session, same-origin, batch size, and concurrency', () => {
    assert.match(source, /auth\.getSession\(/);
    assert.match(source, /assertSameOriginRequest/);
    assert.match(source, /MAX_BATCH\s*=\s*25/);
    assert.match(source, /CONCURRENCY\s*=\s*3/);
    assert.match(source, /mapWithConcurrency/);
  });

  it('rejects absolute relativePath and ignores client connection fields', () => {
    assert.match(source, /абсолютный URL/);
    assert.doesNotMatch(source, /payload\.siteUrl/);
    assert.doesNotMatch(source, /payload\.connectionId/);
    assert.match(source, /resolveBulkRelativePath/);
  });

  it('allows partial success with deterministic id order', () => {
    assert.match(source, /mapWithConcurrency\(propertyIds/);
    assert.match(source, /status:\s*'submitted'/);
    assert.match(source, /status:\s*'failed'/);
    assert.match(source, /status:\s*'skipped'/);
  });
});
