import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GoogleApiError } from './google-errors';
import {
  assertReconnectGoogleSub,
  chooseEncryptedRefreshToken,
} from './google-reconnect';
import {
  shouldPersistSuccessWrite,
  SUCCESS_WRITE_THROTTLE_MS,
} from './connection-health';
import { isBlockedConnectionStatus } from './connection-status';

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
