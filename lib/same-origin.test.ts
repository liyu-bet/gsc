import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertSameOriginRequest } from './same-origin';

describe('assertSameOriginRequest', () => {
  const app = 'https://gsc.example.com';

  it('accepts matching Origin', () => {
    const headers = new Headers({ origin: 'https://gsc.example.com' });
    assert.equal(assertSameOriginRequest(headers, { appUrlOverride: app }).ok, true);
  });

  it('rejects cross-origin', () => {
    const headers = new Headers({ origin: 'https://evil.example' });
    const result = assertSameOriginRequest(headers, { appUrlOverride: app });
    assert.equal(result.ok, false);
  });

  it('rejects missing Origin and Referer', () => {
    const result = assertSameOriginRequest(new Headers(), { appUrlOverride: app });
    assert.equal(result.ok, false);
  });

  it('accepts matching Referer when Origin absent', () => {
    const headers = new Headers({ referer: 'https://gsc.example.com/sitemaps' });
    assert.equal(assertSameOriginRequest(headers, { appUrlOverride: app }).ok, true);
  });

  it('rejects cross-site Sec-Fetch-Site', () => {
    const headers = new Headers({
      origin: 'https://gsc.example.com',
      'sec-fetch-site': 'cross-site',
    });
    assert.equal(assertSameOriginRequest(headers, { appUrlOverride: app }).ok, false);
  });
});
