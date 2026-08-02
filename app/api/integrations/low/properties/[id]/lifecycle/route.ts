import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLowApiToken } from '@/lib/low-api-auth';
import { calculatePropertyLifecycle } from '@/lib/low-integration';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireLowApiToken(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

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

    const body = await calculatePropertyLifecycle({
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
      message.includes('Connection not found')
    ) {
      console.error('[LOW API] Lifecycle Google API failure');
      return NextResponse.json({ error: 'Upstream Search Console error' }, { status: 502 });
    }

    console.error('[LOW API] Lifecycle failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
