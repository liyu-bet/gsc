import crypto from 'node:crypto';
import { env } from './env';
import { randomToken } from './security';

export const GOOGLE_OAUTH_STATE_COOKIE = 'google_oauth_state';
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type GoogleOAuthStatePayload = {
  nonce: string;
  connectionId: string | null;
  exp: number;
};

function signingKey(): Buffer {
  return crypto.createHash('sha256').update(env.sessionSecret, 'utf8').digest();
}

function toBase64Url(value: Buffer | string): string {
  const buf = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  return buf.toString('base64url');
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function createGoogleOAuthState(connectionId?: string | null): {
  stateParam: string;
  cookieValue: string;
  payload: GoogleOAuthStatePayload;
} {
  const payload: GoogleOAuthStatePayload = {
    nonce: randomToken(16),
    connectionId: connectionId || null,
    exp: Date.now() + OAUTH_STATE_TTL_MS,
  };
  const body = toBase64Url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', signingKey()).update(body).digest();
  const cookieValue = `${body}.${toBase64Url(sig)}`;
  return {
    stateParam: payload.nonce,
    cookieValue,
    payload,
  };
}

export type ParsedOAuthState =
  | { ok: true; payload: GoogleOAuthStatePayload }
  | { ok: false; reason: 'missing' | 'invalid' | 'expired' | 'mismatch' };

export function parseGoogleOAuthStateCookie(
  cookieValue: string | undefined | null,
  stateParam: string | undefined | null
): ParsedOAuthState {
  if (!cookieValue || !stateParam) {
    return { ok: false, reason: 'missing' };
  }

  const [body, sig] = cookieValue.split('.');
  if (!body || !sig) {
    return { ok: false, reason: 'invalid' };
  }

  const expected = crypto.createHmac('sha256', signingKey()).update(body).digest();
  const provided = fromBase64Url(sig);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return { ok: false, reason: 'invalid' };
  }

  let payload: GoogleOAuthStatePayload;
  try {
    payload = JSON.parse(fromBase64Url(body).toString('utf8')) as GoogleOAuthStatePayload;
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (
    typeof payload.nonce !== 'string' ||
    typeof payload.exp !== 'number' ||
    !('connectionId' in payload) ||
    (payload.connectionId !== null && typeof payload.connectionId !== 'string')
  ) {
    return { ok: false, reason: 'invalid' };
  }

  if (payload.nonce !== stateParam) {
    return { ok: false, reason: 'mismatch' };
  }

  if (Date.now() > payload.exp) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}

export function oauthStateErrorMessage(
  reason: 'missing' | 'invalid' | 'expired' | 'mismatch'
): string {
  switch (reason) {
    case 'expired':
      return 'Срок действия OAuth state истёк';
    case 'mismatch':
      return 'Неверный OAuth state';
    case 'missing':
      return 'Отсутствует OAuth state';
    default:
      return 'Неверный OAuth state';
  }
}
