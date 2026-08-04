import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GoogleApiError } from './google-errors';
import { shouldPersistConnectionHealthError } from './google-health-mode';

describe('connection health persistence modes', () => {
  it('property mode ignores FORBIDDEN so one site cannot paint the account ERROR', () => {
    const forbidden = new GoogleApiError({
      code: 'FORBIDDEN',
      status: 403,
      safeMessage: 'Google отклонил запрос (нет доступа к ресурсу)',
    });
    assert.equal(shouldPersistConnectionHealthError(forbidden, 'property'), false);
    assert.equal(shouldPersistConnectionHealthError(forbidden, 'account'), true);
  });

  it('property mode still persists account-level auth and quota errors', () => {
    for (const code of [
      'INVALID_GRANT',
      'UNAUTHORIZED',
      'REAUTH_REQUIRED',
      'INSUFFICIENT_SCOPE',
      'QUOTA_EXCEEDED',
      'RATE_LIMITED',
    ] as const) {
      const error = new GoogleApiError({
        code,
        safeMessage: 'x',
        retryable: code === 'QUOTA_EXCEEDED' || code === 'RATE_LIMITED',
      });
      assert.equal(
        shouldPersistConnectionHealthError(error, 'property'),
        true,
        code
      );
    }
  });

  it('property mode ignores INVALID_RESPONSE and UPSTREAM_5XX for connection health', () => {
    assert.equal(
      shouldPersistConnectionHealthError(
        new GoogleApiError({ code: 'INVALID_RESPONSE', safeMessage: 'x' }),
        'property'
      ),
      false
    );
    assert.equal(
      shouldPersistConnectionHealthError(
        new GoogleApiError({ code: 'UPSTREAM_5XX', status: 500, safeMessage: 'x', retryable: true }),
        'property'
      ),
      false
    );
  });

  it('property-write mode does not persist INSUFFICIENT_SCOPE or FORBIDDEN', () => {
    assert.equal(
      shouldPersistConnectionHealthError(
        new GoogleApiError({ code: 'INSUFFICIENT_SCOPE', safeMessage: 'x' }),
        'property-write'
      ),
      false
    );
    assert.equal(
      shouldPersistConnectionHealthError(
        new GoogleApiError({ code: 'FORBIDDEN', safeMessage: 'x' }),
        'property-write'
      ),
      false
    );
    assert.equal(
      shouldPersistConnectionHealthError(
        new GoogleApiError({ code: 'NETWORK', safeMessage: 'x', retryable: true }),
        'property-write'
      ),
      false
    );
  });

  it('property-write mode still persists auth and quota errors', () => {
    for (const code of [
      'INVALID_GRANT',
      'UNAUTHORIZED',
      'REAUTH_REQUIRED',
      'QUOTA_EXCEEDED',
      'RATE_LIMITED',
    ] as const) {
      assert.equal(
        shouldPersistConnectionHealthError(
          new GoogleApiError({ code, safeMessage: 'x' }),
          'property-write'
        ),
        true,
        code
      );
    }
  });
});
