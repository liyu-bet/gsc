import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyGoogleHttpError,
  classifyInvalidResponse,
  classifyNetworkError,
  GoogleApiError,
  redactSecrets,
  statusLabel,
} from './google-errors';
import {
  connectionStatusFromError,
  serializePublicConnection,
  SUCCESS_WRITE_THROTTLE_MS,
} from './connection-health';
import { publicConnectionStatusLabel } from './connection-status';

describe('Google error classification', () => {
  it('classifies invalid_grant on refresh 400 as INVALID_GRANT', () => {
    const error = classifyGoogleHttpError({
      status: 400,
      bodyText: JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
      context: 'token_refresh',
    });
    assert.equal(error.code, 'INVALID_GRANT');
    assert.equal(error.retryable, false);
    assert.equal(connectionStatusFromError(error), 'REVOKED');
    assert.match(error.safeMessage, /отозван/i);
  });

  it('classifies refresh 400 without invalid_grant as UNAUTHORIZED', () => {
    const error = classifyGoogleHttpError({
      status: 400,
      bodyText: JSON.stringify({ error: 'invalid_request' }),
      context: 'token_refresh',
    });
    assert.equal(error.code, 'UNAUTHORIZED');
    assert.equal(connectionStatusFromError(error), 'REAUTH_REQUIRED');
  });

  it('classifies API 401 as UNAUTHORIZED', () => {
    const error = classifyGoogleHttpError({
      status: 401,
      bodyText: '{"error":{"code":401,"message":"Unauthorized"}}',
      context: 'api',
    });
    assert.equal(error.code, 'UNAUTHORIZED');
    assert.equal(connectionStatusFromError(error), 'REAUTH_REQUIRED');
  });

  it('classifies API 403 as FORBIDDEN', () => {
    const error = classifyGoogleHttpError({
      status: 403,
      bodyText: '{"error":{"message":"User does not have sufficient permission"}}',
      context: 'api',
    });
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(connectionStatusFromError(error), 'ERROR');
    assert.equal(error.retryable, false);
  });

  it('classifies insufficient scope as INSUFFICIENT_SCOPE', () => {
    const error = classifyGoogleHttpError({
      status: 403,
      bodyText: '{"error":{"message":"Request had insufficient authentication scopes."}}',
      context: 'api',
    });
    assert.equal(error.code, 'INSUFFICIENT_SCOPE');
    assert.equal(connectionStatusFromError(error), 'ERROR');
  });

  it('classifies 429 rate limit as RATE_LIMITED retryable', () => {
    const error = classifyGoogleHttpError({
      status: 429,
      bodyText: '{"error":{"message":"Rate Limit Exceeded"}}',
      context: 'api',
    });
    assert.equal(error.code, 'RATE_LIMITED');
    assert.equal(error.retryable, true);
    assert.equal(connectionStatusFromError(error), 'ERROR');
    assert.notEqual(connectionStatusFromError(error), 'REVOKED');
  });

  it('classifies daily quota exceeded as QUOTA_EXCEEDED', () => {
    const error = classifyGoogleHttpError({
      status: 429,
      bodyText: '{"error":{"errors":[{"reason":"dailyLimitExceeded","message":"Quota exceeded"}]}}',
      context: 'api',
    });
    assert.equal(error.code, 'QUOTA_EXCEEDED');
    assert.equal(error.retryable, true);
    assert.equal(connectionStatusFromError(error), 'ERROR');
  });

  it('classifies API 500 as UPSTREAM_5XX retryable', () => {
    const error = classifyGoogleHttpError({
      status: 500,
      bodyText: 'Internal Server Error',
      context: 'api',
    });
    assert.equal(error.code, 'UPSTREAM_5XX');
    assert.equal(error.retryable, true);
    assert.equal(connectionStatusFromError(error), 'ERROR');
  });

  it('classifies network errors as NETWORK', () => {
    const error = classifyNetworkError(new Error('fetch failed'));
    assert.equal(error.code, 'NETWORK');
    assert.equal(error.retryable, true);
  });

  it('classifies malformed JSON helpers', () => {
    const error = classifyInvalidResponse('{not-json');
    assert.equal(error.code, 'INVALID_RESPONSE');
    assert.equal(error.safeMessage.includes('{not-json'), true);
  });

  it('redacts secrets from payloads and HTML', () => {
    const token = 'ya29.a0AfH6SMC_secret_token_value_here';
    const redacted = redactSecrets(
      `Authorization: Bearer ${token} refresh_token":"1//abc_secret" client_secret":"xyz"`
    );
    assert.equal(redacted.includes(token), false);
    assert.equal(redacted.includes('1//abc_secret'), false);
    assert.equal(redacted.includes('xyz'), false);
    assert.equal(redactSecrets('<html><body>fail</body></html>'), '[REDACTED_HTML]');
  });

  it('never puts tokens into safeMessage', () => {
    const error = classifyGoogleHttpError({
      status: 401,
      bodyText: JSON.stringify({
        error: 'invalid_grant',
        access_token: 'ya29.leaked',
        refresh_token: '1//leaked',
      }),
      context: 'token_refresh',
    });
    assert.equal(error.safeMessage.includes('ya29'), false);
    assert.equal(error.safeMessage.includes('1//'), false);
    assert.equal(error.safeMessage.includes('leaked'), false);
  });
});

describe('connection status transitions', () => {
  it('maps ACTIVE-relevant errors to REVOKED / REAUTH_REQUIRED / ERROR', () => {
    assert.equal(
      connectionStatusFromError(
        new GoogleApiError({ code: 'INVALID_GRANT', safeMessage: 'x' })
      ),
      'REVOKED'
    );
    assert.equal(
      connectionStatusFromError(
        new GoogleApiError({ code: 'UNAUTHORIZED', safeMessage: 'x' })
      ),
      'REAUTH_REQUIRED'
    );
    assert.equal(
      connectionStatusFromError(
        new GoogleApiError({ code: 'RATE_LIMITED', safeMessage: 'x', retryable: true })
      ),
      'ERROR'
    );
    assert.equal(
      connectionStatusFromError(
        new GoogleApiError({ code: 'UPSTREAM_5XX', safeMessage: 'x', retryable: true })
      ),
      'ERROR'
    );
  });

  it('429 and 5xx never become REVOKED', () => {
    for (const status of [429, 500, 502, 503]) {
      const error = classifyGoogleHttpError({ status, bodyText: 'x', context: 'api' });
      assert.notEqual(connectionStatusFromError(error), 'REVOKED');
    }
  });

  it('exposes success write throttle constant of 5 minutes', () => {
    assert.equal(SUCCESS_WRITE_THROTTLE_MS, 5 * 60 * 1000);
  });
});

describe('status labels and public serializer', () => {
  it('returns Russian status labels', () => {
    assert.equal(publicConnectionStatusLabel('ACTIVE'), 'Активно');
    assert.equal(publicConnectionStatusLabel('REVOKED'), 'Доступ отозван');
    assert.equal(publicConnectionStatusLabel('REAUTH_REQUIRED'), 'Требуется вход');
    assert.equal(publicConnectionStatusLabel('ERROR'), 'Временная ошибка');
    assert.equal(statusLabel('INVALID_GRANT'), 'Доступ отозван — переподключите аккаунт');
  });

  it('serializes public connection without encrypted fields', () => {
    const view = serializePublicConnection({
      id: 'conn_1',
      email: 'a@example.com',
      name: 'A',
      picture: null,
      status: 'ERROR',
      lastErrorCode: 'RATE_LIMITED',
      lastErrorMessage: 'Слишком много запросов к Google. Повторите позже.',
      lastErrorAt: new Date('2026-08-01T12:00:00.000Z'),
      lastSuccessAt: new Date('2026-08-01T11:00:00.000Z'),
      propertiesCount: 3,
    });
    const raw = JSON.stringify(view);
    assert.equal(raw.includes('encryptedAccess'), false);
    assert.equal(raw.includes('encryptedRefresh'), false);
    assert.equal(raw.includes('tokenExpiry'), false);
    assert.equal(view.canRetry, true);
    assert.equal(view.canReconnect, true);
    assert.equal(view.statusLabel, 'Временная ошибка');
  });
});
