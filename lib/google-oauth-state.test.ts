import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import crypto from 'node:crypto';
import {
  createGoogleOAuthState,
  oauthStateErrorMessage,
  parseGoogleOAuthStateCookie,
  resolveGoogleOAuthIntent,
} from './google-oauth-state';

const ORIGINAL = { SESSION_SECRET: process.env.SESSION_SECRET };

before(() => {
  process.env.SESSION_SECRET = 'test-session-secret-for-oauth-state-hmac';
});

after(() => {
  if (ORIGINAL.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL.SESSION_SECRET;
});

describe('Google OAuth intent resolution', () => {
  it('defaults to connect without connectionId', () => {
    const resolved = resolveGoogleOAuthIntent({ intentParam: null, connectionId: null });
    assert.deepEqual(resolved, { ok: true, intent: 'connect', connectionId: null });
  });

  it('defaults to reconnect when only connectionId is present', () => {
    const resolved = resolveGoogleOAuthIntent({
      intentParam: null,
      connectionId: 'conn_1',
    });
    assert.deepEqual(resolved, {
      ok: true,
      intent: 'reconnect',
      connectionId: 'conn_1',
    });
  });

  it('accepts explicit upgrade_sitemap with connectionId', () => {
    const resolved = resolveGoogleOAuthIntent({
      intentParam: 'upgrade_sitemap',
      connectionId: 'conn_1',
    });
    assert.deepEqual(resolved, {
      ok: true,
      intent: 'upgrade_sitemap',
      connectionId: 'conn_1',
    });
  });

  it('rejects invalid intent', () => {
    const resolved = resolveGoogleOAuthIntent({
      intentParam: 'delete_everything',
      connectionId: null,
    });
    assert.equal(resolved.ok, false);
  });

  it('rejects connect with connectionId', () => {
    const resolved = resolveGoogleOAuthIntent({
      intentParam: 'connect',
      connectionId: 'conn_1',
    });
    assert.equal(resolved.ok, false);
  });

  it('rejects reconnect without connectionId', () => {
    const resolved = resolveGoogleOAuthIntent({
      intentParam: 'reconnect',
      connectionId: null,
    });
    assert.equal(resolved.ok, false);
  });

  it('rejects upgrade_sitemap without connectionId', () => {
    const resolved = resolveGoogleOAuthIntent({
      intentParam: 'upgrade_sitemap',
      connectionId: null,
    });
    assert.equal(resolved.ok, false);
  });
});

describe('Google OAuth signed state with intent', () => {
  it('preserves intent and connectionId in signed state', () => {
    const created = createGoogleOAuthState({
      intent: 'upgrade_sitemap',
      connectionId: 'conn_abc',
    });
    const parsed = parseGoogleOAuthStateCookie(created.cookieValue, created.stateParam);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.payload.intent, 'upgrade_sitemap');
      assert.equal(parsed.payload.connectionId, 'conn_abc');
    }
  });

  it('connect state forces null connectionId', () => {
    const created = createGoogleOAuthState({
      intent: 'connect',
      connectionId: 'should-be-ignored',
    });
    assert.equal(created.payload.connectionId, null);
  });

  it('rejects tampered intent (signature break)', () => {
    const created = createGoogleOAuthState({
      intent: 'reconnect',
      connectionId: 'conn_1',
    });
    const [body] = created.cookieValue.split('.');
    const raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      nonce: string;
      connectionId: string;
      intent: string;
      exp: number;
    };
    raw.intent = 'upgrade_sitemap';
    const tamperedBody = Buffer.from(JSON.stringify(raw), 'utf8').toString('base64url');
    const [, sig] = created.cookieValue.split('.');
    const parsed = parseGoogleOAuthStateCookie(`${tamperedBody}.${sig}`, created.stateParam);
    assert.deepEqual(parsed, { ok: false, reason: 'invalid' });
  });

  it('rejects tampered connectionId (signature break)', () => {
    const created = createGoogleOAuthState({
      intent: 'reconnect',
      connectionId: 'conn_1',
    });
    const [body] = created.cookieValue.split('.');
    const raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      nonce: string;
      connectionId: string;
      intent: string;
      exp: number;
    };
    raw.connectionId = 'conn_other';
    const tamperedBody = Buffer.from(JSON.stringify(raw), 'utf8').toString('base64url');
    const [, sig] = created.cookieValue.split('.');
    const parsed = parseGoogleOAuthStateCookie(`${tamperedBody}.${sig}`, created.stateParam);
    assert.deepEqual(parsed, { ok: false, reason: 'invalid' });
  });

  it('rejects expired state', () => {
    const created = createGoogleOAuthState({ intent: 'connect' });
    const body = Buffer.from(
      JSON.stringify({
        nonce: created.stateParam,
        connectionId: null,
        intent: 'connect',
        exp: Date.now() - 1000,
      }),
      'utf8'
    ).toString('base64url');
    const key = crypto.createHash('sha256').update(process.env.SESSION_SECRET!, 'utf8').digest();
    const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
    const parsed = parseGoogleOAuthStateCookie(`${body}.${sig}`, created.stateParam);
    assert.deepEqual(parsed, { ok: false, reason: 'expired' });
  });

  it('rejects missing cookie / state / nonce mismatch', () => {
    assert.deepEqual(parseGoogleOAuthStateCookie(undefined, 'x'), {
      ok: false,
      reason: 'missing',
    });
    assert.deepEqual(parseGoogleOAuthStateCookie('a.b', null), {
      ok: false,
      reason: 'missing',
    });
    const created = createGoogleOAuthState({ intent: 'connect' });
    assert.deepEqual(
      parseGoogleOAuthStateCookie(created.cookieValue, 'other-nonce'),
      { ok: false, reason: 'mismatch' }
    );
  });

  it('maps oauth state errors to safe Russian messages', () => {
    assert.match(oauthStateErrorMessage('expired'), /истёк/i);
    assert.match(oauthStateErrorMessage('missing'), /Отсутствует/);
  });
});
