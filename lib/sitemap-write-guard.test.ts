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

  it('list requires ACTIVE and allows readonly scope', () => {
    assert.doesNotThrow(() =>
      assertConnectionReadyForSitemapList({
        status: 'ACTIVE',
        scope: 'openid https://www.googleapis.com/auth/webmasters.readonly',
      })
    );
    assert.doesNotThrow(() =>
      assertConnectionReadyForSitemapList({ status: 'ACTIVE', scope: null })
    );
  });

  it('list classifies REVOKED with REAUTH_REQUIRED revoked message', () => {
    assert.throws(
      () => assertConnectionReadyForSitemapList({ status: 'REVOKED', scope: null }),
      (error: unknown) =>
        error instanceof GoogleApiError &&
        error.code === 'REAUTH_REQUIRED' &&
        error.safeMessage === 'Доступ отозван — переподключите аккаунт'
    );
  });

  it('list classifies REAUTH_REQUIRED with login message', () => {
    assert.throws(
      () => assertConnectionReadyForSitemapList({ status: 'REAUTH_REQUIRED', scope: null }),
      (error: unknown) =>
        error instanceof GoogleApiError &&
        error.code === 'REAUTH_REQUIRED' &&
        error.safeMessage === 'Требуется повторный вход в аккаунт Google'
    );
  });

  it('list classifies ERROR with CONNECTION_ERROR load message', () => {
    assert.throws(
      () => assertConnectionReadyForSitemapList({ status: 'ERROR', scope: null }),
      (error: unknown) =>
        error instanceof GoogleApiError &&
        error.code === 'CONNECTION_ERROR' &&
        error.safeMessage ===
          'Перед загрузкой карт сайта повторите проверку подключения Google'
    );
  });

  it('list classifies unknown inactive status as CONNECTION_ERROR', () => {
    assert.throws(
      () =>
        assertConnectionReadyForSitemapList({
          status: 'PENDING' as never,
          scope: null,
        }),
      (error: unknown) =>
        error instanceof GoogleApiError &&
        error.code === 'CONNECTION_ERROR' &&
        error.safeMessage ===
          'Перед загрузкой карт сайта повторите проверку подключения Google'
    );
  });
});
