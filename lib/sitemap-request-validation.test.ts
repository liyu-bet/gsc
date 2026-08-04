import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findForbiddenSitemapBodyKey,
  parseStrictDomainScheme,
  parseStrictPropertyIdArray,
} from './sitemap-request-validation';

describe('sitemap-request-validation', () => {
  it('parses strict domainScheme', () => {
    assert.deepEqual(parseStrictDomainScheme(undefined), { ok: true, scheme: 'https' });
    assert.deepEqual(parseStrictDomainScheme('http'), { ok: true, scheme: 'http' });
    assert.equal(parseStrictDomainScheme('HTTP').ok, false);
    assert.equal(parseStrictDomainScheme('ftp').ok, false);
  });

  it('rejects mixed propertyIds types', () => {
    assert.equal(parseStrictPropertyIdArray(['a', 1 as unknown as string]).ok, false);
    assert.equal(parseStrictPropertyIdArray(['a', null as unknown as string]).ok, false);
    const ok = parseStrictPropertyIdArray([' a ', 'a', 'b']);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.deepEqual(ok.ids, ['a', 'b']);
  });

  it('rejects credential-like fields', () => {
    assert.equal(findForbiddenSitemapBodyKey({ sitemap: 'x', connectionId: 'c' }), 'connectionId');
    assert.equal(findForbiddenSitemapBodyKey({ siteUrl: 'https://x' }), 'siteUrl');
    assert.equal(findForbiddenSitemapBodyKey({ sitemap: 'x' }), null);
  });
});
