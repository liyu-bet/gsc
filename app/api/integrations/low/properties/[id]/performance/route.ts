import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLowApiToken } from '@/lib/low-api-auth';
import { calculatePropertyPerformance } from '@/lib/low-integration';
import { GoogleApiError } from '@/lib/google-errors';

export const dynamic = 'force-dynamic';

/**
 * Read-only M2M performance totals for one property.
 * Query: window=latest_day (default).
 *
 * LOW performance intentionally supports only latest_day; rolling_24h is not part of
 * the current LOW contract (the dashboard may still use hourly Search Analytics elsewhere).
 *
 * latest_day = America/Los_Angeles calendar date of request time, minus 2 calendar days
 * (expected finalized lag). Not rolling 24h and not the VPS local date.
 * Zero Search Analytics rows → clicks=0, impressions=0.
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
    if (
      (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      console.error('[LOW API] Performance timeout');
      return NextResponse.json({ error: 'Upstream Search Console error' }, { status: 502 });
    }

    if (error instanceof GoogleApiError) {
      console.error('[LOW API] Performance Google API failure');
      return NextResponse.json({ error: 'Upstream Search Console error' }, { status: 502 });
    }

    console.error('[LOW API] Performance failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
