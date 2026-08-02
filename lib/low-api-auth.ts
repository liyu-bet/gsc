import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

const UNAUTHORIZED = { error: 'Unauthorized' } as const;

function getConfiguredToken(): string | null {
  const raw = process.env.GSC_LOW_API_TOKEN;
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  return token.length > 0 ? token : null;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}

/** Constant-time string compare; false if lengths differ. */
export function timingSafeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validates Authorization: Bearer <GSC_LOW_API_TOKEN>.
 * Fail-closed when the env token is missing/empty.
 * Does not log the Authorization header or token values.
 */
export function requireLowApiToken(req: Request): { ok: true } | { ok: false; response: NextResponse } {
  const expected = getConfiguredToken();
  if (!expected) {
    console.error('[LOW API] GSC_LOW_API_TOKEN is not configured');
    return { ok: false, response: NextResponse.json(UNAUTHORIZED, { status: 401 }) };
  }

  const provided = extractBearerToken(req);
  if (!provided || !timingSafeTokenEqual(provided, expected)) {
    return { ok: false, response: NextResponse.json(UNAUTHORIZED, { status: 401 }) };
  }

  return { ok: true };
}
