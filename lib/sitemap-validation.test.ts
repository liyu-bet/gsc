import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveBulkRelativePath,
  resolveSitemapUrl,
  validateSitemapIndexUrl,
} from './sitemap-validation';

describe('sitemap-validation URL-prefix', () => {
  const root = 'https://example.com/';
  const nested = 'https://example.com/blog/';

  it('resolves root property + relative path', () => {
    const result = resolveSitemapUrl(root, 'sitemap.xml');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.sitemapUrl, 'https://example.com/sitemap.xml');
  });

  it('resolves nested prefix + relative path', () => {
    const result = resolveSitemapUrl(nested, 'sitemap.xml');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.sitemapUrl, 'https://example.com/blog/sitemap.xml');
  });

  it('allows nested prefix absolute URL inside prefix', () => {
    const result = resolveSitemapUrl(nested, 'https://example.com/blog/news/sitemap.xml');
    assert.equal(result.ok, true);
  });

  it('rejects pathname outside prefix', () => {
    const result = resolveSitemapUrl(nested, 'https://example.com/sitemap.xml');
    assert.equal(result.ok, false);
  });

  it('rejects different protocol', () => {
    assert.equal(resolveSitemapUrl(nested, 'http://example.com/blog/sitemap.xml').ok, false);
  });

  it('rejects different hostname', () => {
    assert.equal(
      resolveSitemapUrl(nested, 'https://other.example.com/blog/sitemap.xml').ok,
      false
    );
  });

  it('rejects different port', () => {
    assert.equal(resolveSitemapUrl(root, 'https://example.com:8443/sitemap.xml').ok, false);
  });

  it('rejects username/password', () => {
    assert.equal(resolveSitemapUrl(root, 'https://user:pass@example.com/sitemap.xml').ok, false);
  });

  it('rejects fragment', () => {
    assert.equal(resolveSitemapUrl(root, 'https://example.com/sitemap.xml#x').ok, false);
  });

  it('rejects ftp', () => {
    assert.equal(resolveSitemapUrl(root, 'ftp://example.com/sitemap.xml').ok, false);
  });

  it('rejects empty', () => {
    assert.equal(resolveSitemapUrl(root, '   ').ok, false);
  });

  it('rejects control chars', () => {
    assert.equal(resolveSitemapUrl(root, 'sitemap.xml\n').ok, false);
  });

  it('rejects over 2048 chars', () => {
    assert.equal(resolveSitemapUrl(root, 'a'.repeat(2049)).ok, false);
  });

  it('path traversal cannot escape prefix', () => {
    assert.equal(resolveSitemapUrl(nested, '../sitemap.xml').ok, false);
    assert.equal(resolveSitemapUrl(nested, 'https://example.com/blog/../sitemap.xml').ok, false);
  });

  it('leading slash must still stay in prefix', () => {
    assert.equal(resolveSitemapUrl(nested, '/sitemap.xml').ok, false);
    assert.equal(resolveSitemapUrl(nested, '/blog/sitemap.xml').ok, true);
  });
});

describe('sitemap-validation domain property', () => {
  const domain = 'sc-domain:example.com';

  it('allows exact domain and subdomains', () => {
    assert.equal(resolveSitemapUrl(domain, 'https://example.com/sitemap.xml').ok, true);
    assert.equal(resolveSitemapUrl(domain, 'https://www.example.com/sitemap.xml').ok, true);
    assert.equal(resolveSitemapUrl(domain, 'https://news.example.com/sitemap.xml').ok, true);
  });

  it('rejects deceptive hostnames', () => {
    assert.equal(resolveSitemapUrl(domain, 'https://notexample.com/sitemap.xml').ok, false);
    assert.equal(resolveSitemapUrl(domain, 'https://example.com.evil.test/sitemap.xml').ok, false);
    assert.equal(resolveSitemapUrl(domain, 'https://evil-example.com/sitemap.xml').ok, false);
  });

  it('defaults relative to https://example.com/...', () => {
    const result = resolveSitemapUrl(domain, 'sitemap.xml');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.sitemapUrl, 'https://example.com/sitemap.xml');
  });

  it('allows explicit http scheme for domain relative', () => {
    const result = resolveSitemapUrl(domain, '/sitemap.xml', { domainScheme: 'http' });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.sitemapUrl, 'http://example.com/sitemap.xml');
  });

  it('rejects nonstandard port', () => {
    assert.equal(resolveSitemapUrl(domain, 'https://example.com:8443/sitemap.xml').ok, false);
  });

  it('rejects credentials and fragment', () => {
    assert.equal(resolveSitemapUrl(domain, 'https://u:p@example.com/sitemap.xml').ok, false);
    assert.equal(resolveSitemapUrl(domain, 'https://example.com/sitemap.xml#x').ok, false);
  });
});

describe('sitemap-validation helpers', () => {
  it('validateSitemapIndexUrl requires valid absolute under property', () => {
    const ok = validateSitemapIndexUrl('https://example.com/', 'https://example.com/sitemap-index.xml');
    assert.equal(ok.ok, true);
  });

  it('bulk relative path rejects absolute URLs', () => {
    const result = resolveBulkRelativePath('https://example.com/', 'https://example.com/sitemap.xml');
    assert.equal(result.ok, false);
  });
});
