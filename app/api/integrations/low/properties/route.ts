import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLowApiToken } from '@/lib/low-api-auth';
import {
  buildLowPropertiesWhere,
  encodeLowPropertiesCursor,
  lowPropertiesOrderBy,
  lowPropertySelect,
  parseLowPropertiesQuery,
  serializeLowProperty,
  type LowPropertiesResponse,
  type LowPropertyRow,
} from '@/lib/low-integration';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = requireLowApiToken(req);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = parseLowPropertiesQuery(searchParams);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const where = buildLowPropertiesWhere({
      cursor: parsed.cursor,
      updatedSince: parsed.updatedSince,
    });

    const rows = (await prisma.gscProperty.findMany({
      where,
      select: lowPropertySelect,
      orderBy: lowPropertiesOrderBy,
      take: parsed.limit + 1,
    })) as LowPropertyRow[];

    const hasMore = rows.length > parsed.limit;
    const page = hasMore ? rows.slice(0, parsed.limit) : rows;
    const items = page.map(serializeLowProperty);

    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeLowPropertiesCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id })
        : null;

    const body: LowPropertiesResponse = {
      items,
      nextCursor,
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(body);
  } catch {
    console.error('[LOW API] Failed to list properties');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
