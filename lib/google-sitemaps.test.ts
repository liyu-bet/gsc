import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { googleSitemapUrlsForTests } from './google-sitemaps';
import { GOOGLE_WEBMASTERS_READONLY_SCOPE, GOOGLE_WEBMASTERS_SCOPE } from './google-scopes';

describe('google-sitemaps URL builders', () => {
  it('encodes URL-prefix siteUrl for list', () => {
    const url = googleSitemapUrlsForTests.sitemapsCollectionUrl('https://example.com/blog/');
    assert.equal(
      url,
      'https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2Fblog%2F/sitemaps'
    );
  });

  it('encodes sc-domain siteUrl for list', () => {
    const url = googleSitemapUrlsForTests.sitemapsCollectionUrl('sc-domain:example.com');
    assert.equal(
      url,
      'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/sitemaps'
    );
  });

  it('encodes sitemapIndex as query param', () => {
    const url = googleSitemapUrlsForTests.sitemapsCollectionUrl(
      'https://example.com/',
      'https://example.com/sitemap-index.xml'
    );
    assert.match(url, /\?sitemapIndex=https%3A%2F%2Fexample.com%2Fsitemap-index\.xml$/);
  });

  it('encodes siteUrl and feedpath independently for submit', () => {
    const url = googleSitemapUrlsForTests.sitemapFeedUrl(
      'https://example.com/',
      'https://example.com/sitemap.xml'
    );
    assert.equal(
      url,
      'https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/sitemaps/https%3A%2F%2Fexample.com%2Fsitemap.xml'
    );
  });
});

describe('google-sitemaps source contracts', () => {
  const source = readFileSync(path.join(process.cwd(), 'lib/google-sitemaps.ts'), 'utf8');

  it('list uses GET without body and property-write health', () => {
    assert.match(source, /method:\s*'GET'/);
    assert.match(source, /healthMode:\s*'property-write'/);
    assert.match(source, /cache:\s*'no-store'/);
    assert.doesNotMatch(source, /listSitemaps[\s\S]*body:/);
  });

  it('submit uses PUT, assertCanManageSitemaps, and does not parse JSON body', () => {
    assert.match(source, /method:\s*'PUT'/);
    assert.match(source, /assertCanManageSitemaps\(connection\.scope\)/);
    assert.doesNotMatch(source, /submitSitemap[\s\S]*parseGoogleJsonResponse/);
    assert.doesNotMatch(source, /submitSitemap[\s\S]*body:\s*/);
  });

  it('documents expected scopes for guards', () => {
    assert.equal(GOOGLE_WEBMASTERS_SCOPE.includes('webmasters'), true);
    assert.equal(GOOGLE_WEBMASTERS_READONLY_SCOPE.endsWith('readonly'), true);
  });
});
