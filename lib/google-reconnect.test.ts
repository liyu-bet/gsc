import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GoogleApiError } from './google-errors';
import {
  assertReconnectGoogleSub,
  chooseEncryptedRefreshToken,
  chooseOAuthScope,
} from './google-reconnect';
import {
  shouldPersistSuccessWrite,
  SUCCESS_WRITE_THROTTLE_MS,
  safePersistConnectionError,
} from './connection-health';
import { isBlockedConnectionStatus } from './connection-status';
import { prisma } from './prisma';

describe('OAuth reconnect account guard', () => {
  it('allows matching Google sub', () => {
    assert.doesNotThrow(() => assertReconnectGoogleSub('sub-1', 'sub-1'));
  });

  it('rejects mismatched Google sub with safe message', () => {
    assert.throws(
      () => assertReconnectGoogleSub('sub-1', 'sub-other'),
      (error: unknown) =>
        error instanceof GoogleApiError &&
        error.safeMessage === 'Выбран другой аккаунт Google' &&
        error.code === 'UNAUTHORIZED'
    );
  });

  it('keeps existing refresh token when Google omits a new one', () => {
    assert.equal(
      chooseEncryptedRefreshToken(undefined, 'enc-old'),
      'enc-old'
    );
    assert.equal(chooseEncryptedRefreshToken(null, 'enc-old'), 'enc-old');
  });

  it('replaces refresh token when Google returns a new one', () => {
    assert.equal(
      chooseEncryptedRefreshToken('enc-new', 'enc-old'),
      'enc-new'
    );
  });

  it('replaces scope when Google returns a new scope', () => {
    assert.equal(
      chooseOAuthScope('openid email webmasters.readonly', 'openid email'),
      'openid email webmasters.readonly'
    );
  });

  it('keeps existing scope when Google omits a new scope', () => {
    assert.equal(chooseOAuthScope(undefined, 'openid email'), 'openid email');
    assert.equal(chooseOAuthScope('', 'openid email'), 'openid email');
    assert.equal(chooseOAuthScope(null, 'openid email'), 'openid email');
  });

  it('uses null scope for brand-new connections without scope', () => {
    assert.equal(chooseOAuthScope(undefined, null), null);
  });
});

describe('best-effort health persistence', () => {
  it('keeps RATE_LIMITED when Prisma health write fails', async () => {
    const googleError = new GoogleApiError({
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
      safeMessage: 'Слишком много запросов к Google. Повторите позже.',
    });

    const originalUpdate = prisma.googleConnection.update;
    prisma.googleConnection.update = (async () => {
      throw new Error('P2022: column does not exist');
    }) as typeof prisma.googleConnection.update;

    try {
      await safePersistConnectionError('conn_test', googleError);
      // Caller still rethrows the Google error — not Prisma.
      assert.equal(googleError.code, 'RATE_LIMITED');
      assert.equal(googleError.name, 'GoogleApiError');
      assert.equal(String(googleError.message).includes('P2022'), false);
    } finally {
      prisma.googleConnection.update = originalUpdate;
    }
  });
});

describe('success write throttling', () => {
  const base = {
    status: 'ACTIVE' as const,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorAt: null,
    lastSuccessAt: new Date('2026-08-01T12:00:00.000Z'),
  };

  it('skips write within 5 minutes for healthy ACTIVE connections', () => {
    const now = base.lastSuccessAt!.getTime() + SUCCESS_WRITE_THROTTLE_MS - 1;
    assert.equal(shouldPersistSuccessWrite({ ...base, now }), false);
  });

  it('writes after throttle window', () => {
    const now = base.lastSuccessAt!.getTime() + SUCCESS_WRITE_THROTTLE_MS;
    assert.equal(shouldPersistSuccessWrite({ ...base, now }), true);
  });

  it('always writes when clearing ERROR → ACTIVE', () => {
    assert.equal(
      shouldPersistSuccessWrite({
        ...base,
        status: 'ERROR',
        lastErrorCode: 'RATE_LIMITED',
        lastErrorMessage: 'tmp',
        lastErrorAt: new Date(),
        now: base.lastSuccessAt!.getTime() + 1000,
      }),
      true
    );
  });

  it('force write bypasses throttle', () => {
    assert.equal(
      shouldPersistSuccessWrite({
        ...base,
        force: true,
        now: base.lastSuccessAt!.getTime() + 1000,
      }),
      true
    );
  });
});

describe('blocked connection gate', () => {
  it('treats REVOKED and REAUTH_REQUIRED as blocked (no refresh)', () => {
    assert.equal(isBlockedConnectionStatus('REVOKED'), true);
    assert.equal(isBlockedConnectionStatus('REAUTH_REQUIRED'), true);
    assert.equal(isBlockedConnectionStatus('ERROR'), false);
    assert.equal(isBlockedConnectionStatus('ACTIVE'), false);
  });
});
