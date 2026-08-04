import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GoogleApiError } from './google-errors';
import { mapSitemapRouteError, validationRouteError } from './sitemap-route-errors';

describe('sitemap-route-errors', () => {
  it('maps GoogleApiError codes to safe HTTP statuses', () => {
    assert.equal(mapSitemapRouteError(new GoogleApiError({ code: 'INVALID_GRANT', safeMessage: 'a' })).httpStatus, 409);
    assert.equal(mapSitemapRouteError(new GoogleApiError({ code: 'REAUTH_REQUIRED', safeMessage: 'a' })).httpStatus, 409);
    assert.equal(mapSitemapRouteError(new GoogleApiError({ code: 'INSUFFICIENT_SCOPE', safeMessage: 'a' })).httpStatus, 403);
    assert.equal(mapSitemapRouteError(new GoogleApiError({ code: 'FORBIDDEN', safeMessage: 'a' })).httpStatus, 403);
    assert.equal(mapSitemapRouteError(new GoogleApiError({ code: 'RATE_LIMITED', safeMessage: 'a' })).httpStatus, 429);
    assert.equal(mapSitemapRouteError(new GoogleApiError({ code: 'UPSTREAM_5XX', safeMessage: 'a' })).httpStatus, 502);
    assert.equal(mapSitemapRouteError(new GoogleApiError({ code: 'INVALID_RESPONSE', safeMessage: 'a' })).httpStatus, 502);
  });

  it('hides unknown Error.message', () => {
    const mapped = mapSitemapRouteError(new Error('secret db boom'));
    assert.equal(mapped.httpStatus, 502);
    assert.equal(mapped.body.code, 'UNKNOWN');
    assert.equal(mapped.body.message.includes('secret'), false);
  });

  it('validation is 400', () => {
    const mapped = validationRouteError('bad');
    assert.equal(mapped.httpStatus, 400);
    assert.equal(mapped.body.code, 'VALIDATION');
  });
});
