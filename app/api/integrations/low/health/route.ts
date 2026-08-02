import { NextResponse } from 'next/server';
import { requireLowApiToken } from '@/lib/low-api-auth';
import type { LowHealthResponse } from '@/lib/low-integration';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = requireLowApiToken(req);
  if (!auth.ok) return auth.response;

  const body: LowHealthResponse = {
    ok: true,
    service: 'gsc',
    generatedAt: new Date().toISOString(),
  };
  return NextResponse.json(body);
}
