import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GoogleApiError } from './google-errors';
import {
  assertConnectionReadyForSitemapList,
  assertConnectionReadyForSitemapWrite,
} from './sitemap-write-guard';

describe('assertConnectionReadyForSitemapWrite', () => {
  it('allows ACTIVE with full webmasters scope', () => {
    assert.doesNotThrow(() =>
      assertConnectionReadyForSitemapWrite({
        status: 'ACTIVE',
        scope: 'openid https://www.googleapis.com/auth/webmasters',
      })
    );
  });

  it('blocks ERROR before fetch', () => {
    assert.throws(
      () =>
        assertConnectionReadyForSitemapWrite({
          status: 'ERROR',
          scope: 'openid https://www.googleapis.com/auth/webmasters',
        }),
      (error: unknown) =>
        error instanceof GoogleApiError &&
        error.code === 'CONNECTION_ERROR' &&
        error.safeMessage.includes('повторите проверку')
    );
  });

  it('blocks REVOKED and REAUTH_REQUIRED', () => {
    for (const status of ['REVOKED', 'REAUTH_REQUIRED'] as const) {
      assert.throws(
        () =>
          assertConnectionReadyForSitemapWrite({
            status,
            scope: 'openid https://www.googleapis.com/auth/webmasters',
          }),
        (error: unknown) => error instanceof GoogleApiError && error.code === 'REAUTH_REQUIRED'
      );
    }
  });

  it('blocks readonly and unknown scope', () => {
    assert.throws(
      () =>
        assertConnectionReadyForSitemapWrite({
          status: 'ACTIVE',
          scope: 'openid https://www.googleapis.com/auth/webmasters.readonly',
        }),
      (error: unknown) => error instanceof GoogleApiError && error.code === 'INSUFFICIENT_SCOPE'
    );
    assert.throws(
      () =>
        assertConnectionReadyForSitemapWrite({
          status: 'ACTIVE',
          scope: null,
        }),
      (error: unknown) => error instanceof GoogleApiError && error.code === 'INSUFFICIENT_SCOPE'
    );
  });

  it('list requires ACTIVE', () => {
    assert.throws(
      () => assertConnectionReadyForSitemapList({ status: 'ERROR', scope: null }),
      (error: unknown) => error instanceof GoogleApiError && error.code === 'CONNECTION_ERROR'
    );
    assert.doesNotThrow(() =>
      assertConnectionReadyForSitemapList({ status: 'ACTIVE', scope: null })
    );
  });
});
