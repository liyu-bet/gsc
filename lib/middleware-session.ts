/**
 * Edge-safe verification of the existing admin session cookie format.
 * Does not change cookie encoding used by lib/auth.ts.
 */

const COOKIE_NAME = 'gsc_admin_session';

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function signEmail(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email));
  return bytesToHex(signature);
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

export async function verifySessionToken(token?: string | null): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) return false;

  try {
    const raw = new TextDecoder().decode(base64UrlToBytes(token));
    const parsed = JSON.parse(raw) as { email?: string; role?: string; sig?: string };
    if (!parsed.email || !parsed.sig || parsed.role !== 'admin') return false;
    const expected = await signEmail(parsed.email, secret);
    return safeEqual(parsed.sig, expected);
  } catch {
    return false;
  }
}
