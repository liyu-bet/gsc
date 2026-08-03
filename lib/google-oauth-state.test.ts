import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import crypto from 'node:crypto';
import {
  createGoogleOAuthState,
  oauthStateErrorMessage,
  OAUTH_STATE_TTL_MS,
  parseGoogleOAuthStateCookie,
} from './google-oauth-state';

const ORIGINAL = {
  SESSION_SECRET: process.env.SESSION_SECRET,
};

before(() => {
  process.env.SESSION_SECRET = 'test-session-secret-for-oauth-state-hmac';
});

after(() => {
  if (ORIGINAL.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL.SESSION_SECRET;
});

describe('Google OAuth signed state', () => {
  it('accepts valid signed state with matching nonce', () => {
    const created = createGoogleOAuthState('conn_abc');
    const parsed = parseGoogleOAuthStateCookie(created.cookieValue, created.stateParam);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.payload.connectionId, 'conn_abc');
      assert.equal(parsed.payload.nonce, created.stateParam);
      assert.ok(parsed.payload.exp > Date.now());
    }
  });

  it('rejects invalid signature', () => {
    const created = createGoogleOAuthState(null);
    const tampered = created.cookieValue.replace(/\.[^.]+$/, '.YWJj');
    const parsed = parseGoogleOAuthStateCookie(tampered, created.stateParam);
    assert.deepEqual(parsed, { ok: false, reason: 'invalid' });
  });

  it('rejects expired state', () => {
    const created = createGoogleOAuthState('conn_1');
    const body = Buffer.from(
      JSON.stringify({
        nonce: created.stateParam,
        connectionId: 'conn_1',
        exp: Date.now() - 1000,
      }),
      'utf8'
    ).toString('base64url');
    const key = crypto.createHash('sha256').update(process.env.SESSION_SECRET!, 'utf8').digest();
    const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
    const parsed = parseGoogleOAuthStateCookie(`${body}.${sig}`, created.stateParam);
    assert.deepEqual(parsed, { ok: false, reason: 'expired' });
  });

  it('rejects missing state', () => {
    assert.deepEqual(parseGoogleOAuthStateCookie(undefined, 'x'), {
      ok: false,
      reason: 'missing',
    });
    assert.deepEqual(parseGoogleOAuthStateCookie('a.b', null), {
      ok: false,
      reason: 'missing',
    });
  });

  it('rejects mismatched nonce', () => {
    const created = createGoogleOAuthState('conn_1');
    const parsed = parseGoogleOAuthStateCookie(created.cookieValue, 'other-nonce');
    assert.deepEqual(parsed, { ok: false, reason: 'mismatch' });
  });

  it('supports connect without connectionId for new accounts', () => {
    const created = createGoogleOAuthState();
    const parsed = parseGoogleOAuthStateCookie(created.cookieValue, created.stateParam);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.payload.connectionId, null);
  });

  it('maps oauth state errors to safe Russian messages', () => {
    assert.match(oauthStateErrorMessage('expired'), /истёк/i);
    assert.match(oauthStateErrorMessage('missing'), /Отсутствует/);
    assert.match(oauthStateErrorMessage('invalid'), /Неверный/);
    assert.match(oauthStateErrorMessage('mismatch'), /Неверный/);
  });

  it('uses a 10 minute TTL', () => {
    assert.equal(OAUTH_STATE_TTL_MS, 10 * 60 * 1000);
  });
});
