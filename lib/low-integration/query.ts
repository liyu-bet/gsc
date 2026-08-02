import { z } from 'zod';

export const LOW_PROPERTIES_DEFAULT_LIMIT = 100;
export const LOW_PROPERTIES_MAX_LIMIT = 200;

export type LowPropertiesCursor = {
  updatedAt: string;
  id: string;
};

const cursorSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  id: z.string().min(1),
});

export function encodeLowPropertiesCursor(cursor: LowPropertiesCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeLowPropertiesCursor(raw: string): LowPropertiesCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    const result = cursorSchema.safeParse(parsed);
    if (!result.success) return null;
    if (Number.isNaN(Date.parse(result.data.updatedAt))) return null;
    return { updatedAt: result.data.updatedAt, id: result.data.id };
  } catch {
    return null;
  }
}

export type ParseLowPropertiesQueryResult =
  | {
      ok: true;
      limit: number;
      cursor: LowPropertiesCursor | null;
      updatedSince: Date | null;
    }
  | { ok: false; error: string };

export function parseLowPropertiesQuery(searchParams: URLSearchParams): ParseLowPropertiesQueryResult {
  const limitRaw = searchParams.get('limit');
  let limit = LOW_PROPERTIES_DEFAULT_LIMIT;
  if (limitRaw != null && limitRaw !== '') {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return { ok: false, error: 'Invalid limit' };
    }
    if (parsed > LOW_PROPERTIES_MAX_LIMIT) {
      return { ok: false, error: `limit must be <= ${LOW_PROPERTIES_MAX_LIMIT}` };
    }
    limit = parsed;
  }

  const cursorRaw = searchParams.get('cursor');
  let cursor: LowPropertiesCursor | null = null;
  if (cursorRaw != null && cursorRaw !== '') {
    cursor = decodeLowPropertiesCursor(cursorRaw);
    if (!cursor) {
      return { ok: false, error: 'Invalid cursor' };
    }
  }

  const updatedSinceRaw = searchParams.get('updatedSince');
  let updatedSince: Date | null = null;
  if (updatedSinceRaw != null && updatedSinceRaw !== '') {
    const parsed = new Date(updatedSinceRaw);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: 'Invalid updatedSince' };
    }
    updatedSince = parsed;
  }

  return { ok: true, limit, cursor, updatedSince };
}

/**
 * Stable pagination: orderBy updatedAt ASC, id ASC.
 * Cursor means "rows strictly after (updatedAt, id)".
 */
export function buildLowPropertiesWhere(input: {
  cursor: LowPropertiesCursor | null;
  updatedSince: Date | null;
}): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (input.updatedSince) {
    and.push({ updatedAt: { gte: input.updatedSince } });
  }

  if (input.cursor) {
    const cursorDate = new Date(input.cursor.updatedAt);
    and.push({
      OR: [
        { updatedAt: { gt: cursorDate } },
        {
          AND: [{ updatedAt: cursorDate }, { id: { gt: input.cursor.id } }],
        },
      ],
    });
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0]!;
  return { AND: and };
}

export const lowPropertiesOrderBy = [{ updatedAt: 'asc' as const }, { id: 'asc' as const }];

/** Apply cursor pagination over an already-sorted list (for unit tests). */
export function paginateSortedProperties<T extends { id: string; updatedAt: Date }>(
  rows: T[],
  input: { limit: number; cursor: LowPropertiesCursor | null; updatedSince: Date | null }
): { items: T[]; nextCursor: string | null } {
  let filtered = rows;
  if (input.updatedSince) {
    const since = input.updatedSince.getTime();
    filtered = filtered.filter((row) => row.updatedAt.getTime() >= since);
  }
  if (input.cursor) {
    const cursorMs = Date.parse(input.cursor.updatedAt);
    filtered = filtered.filter((row) => {
      const ms = row.updatedAt.getTime();
      return ms > cursorMs || (ms === cursorMs && row.id > input.cursor!.id);
    });
  }

  const page = filtered.slice(0, input.limit);
  const last = page[page.length - 1];
  const hasMore = filtered.length > input.limit;
  return {
    items: page,
    nextCursor:
      hasMore && last
        ? encodeLowPropertiesCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id })
        : null,
  };
}
