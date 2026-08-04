import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLowApiToken } from '@/lib/low-api-auth';
import { calculatePropertyPerformance } from '@/lib/low-integration';

export const dynamic = 'force-dynamic';

/**
 * Read-only M2M performance totals for one property.
 * Query: window=latest_day (default). rolling_24h is not exposed yet.
 * Semantics: latest available Search Console calendar day (typically today−2), not rolling 24h.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireLowApiToken(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const url = new URL(req.url);
  const window = (url.searchParams.get('window') ?? 'latest_day').trim();
  if (window !== 'latest_day') {
    return NextResponse.json(
      { error: 'Unsupported window. Use window=latest_day.' },
      { status: 400 }
    );
  }

  try {
    const property = await prisma.gscProperty.findUnique({
      where: { id },
      select: {
        id: true,
        siteUrl: true,
        connectionId: true,
      },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const body = await calculatePropertyPerformance({
      propertyId: property.id,
      siteUrl: property.siteUrl,
      connectionId: property.connectionId,
    });

    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (
      message.includes('Search Analytics') ||
      message.includes('Invalid Search Console') ||
      message.includes('timed out') ||
      message.includes('Connection not found') ||
      message.includes('aborted')
    ) {
      console.error('[LOW API] Performance Google API failure');
      return NextResponse.json({ error: 'Upstream Search Console error' }, { status: 502 });
    }

    console.error('[LOW API] Performance failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
