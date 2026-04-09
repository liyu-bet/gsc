import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto, { timingSafeEqual } from 'node:crypto';
import { env } from './env';
import { isSecureAppUrl } from './urls';

const COOKIE_NAME = 'gsc_admin_session';

type SessionPayload = {
  email: string;
  role: 'admin';
};

function sign(email: string): string {
  return crypto.createHmac('sha256', env.sessionSecret).update(email).digest('hex');
}

function encode(email: string): string {
  const payload = {
    email,
    role: 'admin' as const,
    sig: sign(email),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decode(token: string): SessionPayload | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { email?: string; role?: 'admin'; sig?: string };

    if (!parsed.email || !parsed.sig || parsed.role !== 'admin') {
      return null;
    }

    const expected = sign(parsed.email);
    const a = Buffer.from(parsed.sig);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }

    return {
      email: parsed.email,
      role: 'admin',
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(email: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encode(email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureAppUrl(),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return decode(token);
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session?.email) {
    redirect('/login');
  }
  return session;
}

export function verifyAdminCredentials(email: string, password: string): boolean {
  const e1 = Buffer.from(email.trim().toLowerCase());
  const e2 = Buffer.from(env.adminEmail.trim().toLowerCase());
  const p1 = Buffer.from(password);
  const p2 = Buffer.from(env.adminPassword);

  return (
    e1.length === e2.length &&
    p1.length === p2.length &&
    timingSafeEqual(e1, e2) &&
    timingSafeEqual(p1, p2)
  );
}
