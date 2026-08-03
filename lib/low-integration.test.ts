import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { GET as getHealth } from '../app/api/integrations/low/health/route';
import { GET as getProperties } from '../app/api/integrations/low/properties/route';
import { GET as getLifecycle } from '../app/api/integrations/low/properties/[id]/lifecycle/route';
import { isMiddlewareAuthBypassPath } from './middleware-auth-bypass';
import {
  LOW_FORBIDDEN_RESPONSE_KEYS,
  addUtcDays,
  calculatePropertyLifecycle,
  collectJsonKeys,
  encodeLowPropertiesCursor,
  enumerateDateWindows,
  findEarliestImpressionAndClickDates,
  paginateSortedProperties,
  parseLowPropertiesQuery,
  parseSearchAnalyticsDateRows,
  serializeLowProperty,
} from './low-integration';

const ORIGINAL_TOKEN = process.env.GSC_LOW_API_TOKEN;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.GSC_LOW_API_TOKEN;
  else process.env.GSC_LOW_API_TOKEN = ORIGINAL_TOKEN;
});

function authHeaders(token = 'test-gsc-low-token'): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

describe('LOW integration health', () => {
  it('returns 401 without token', async () => {
    process.env.GSC_LOW_API_TOKEN = 'test-gsc-low-token';
    const res = await getHealth(new Request('http://localhost/api/integrations/low/health'));
    assert.equal(res.status, 401);
  });

  it('returns 401 with wrong token', async () => {
    process.env.GSC_LOW_API_TOKEN = 'test-gsc-low-token';
    const res = await getHealth(
      new Request('http://localhost/api/integrations/low/health', {
        headers: authHeaders('wrong-token'),
      })
    );
    assert.equal(res.status, 401);
  });

  it('returns 200 with correct token', async () => {
    process.env.GSC_LOW_API_TOKEN = 'test-gsc-low-token';
    const res = await getHealth(
      new Request('http://localhost/api/integrations/low/health', {
        headers: authHeaders(),
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'gsc');
    assert.equal(typeof body.generatedAt, 'string');
  });

  it('fails closed when token env is missing', async () => {
    delete process.env.GSC_LOW_API_TOKEN;
    const res = await getHealth(
      new Request('http://localhost/api/integrations/low/health', {
        headers: authHeaders('anything'),
      })
    );
    assert.equal(res.status, 401);
  });
});

describe('LOW integration properties query validation', () => {
  it('rejects limit above maximum', () => {
    const parsed = parseLowPropertiesQuery(new URLSearchParams('limit=999'));
    assert.equal(parsed.ok, false);
  });

  it('rejects invalid updatedSince', () => {
    const parsed = parseLowPropertiesQuery(new URLSearchParams('updatedSince=nope'));
    assert.equal(parsed.ok, false);
  });

  it('properties endpoint is token-protected', async () => {
    process.env.GSC_LOW_API_TOKEN = 'test-gsc-low-token';
    const res = await getProperties(new Request('http://localhost/api/integrations/low/properties'));
    assert.equal(res.status, 401);
  });
});

describe('LOW integration pagination', () => {
  it('does not duplicate or skip across pages', () => {
    const rows = [
      { id: 'a', updatedAt: new Date('2024-01-01T00:00:00.000Z') },
      { id: 'b', updatedAt: new Date('2024-01-01T00:00:00.000Z') },
      { id: 'c', updatedAt: new Date('2024-01-02T00:00:00.000Z') },
      { id: 'd', updatedAt: new Date('2024-01-03T00:00:00.000Z') },
    ];

    const page1 = paginateSortedProperties(rows, { limit: 2, cursor: null, updatedSince: null });
    assert.deepEqual(
      page1.items.map((r) => r.id),
      ['a', 'b']
    );
    assert.ok(page1.nextCursor);

    const cursor = JSON.parse(Buffer.from(page1.nextCursor!, 'base64url').toString('utf8')) as {
      updatedAt: string;
      id: string;
    };
    const page2 = paginateSortedProperties(rows, {
      limit: 2,
      cursor,
      updatedSince: null,
    });
    assert.deepEqual(
      page2.items.map((r) => r.id),
      ['c', 'd']
    );

    const all = [...page1.items, ...page2.items].map((r) => r.id);
    assert.deepEqual(all, ['a', 'b', 'c', 'd']);
    assert.equal(new Set(all).size, 4);
  });
});

describe('LOW integration serializers', () => {
  it('does not include encrypted tokens or client secret', () => {
    const item = serializeLowProperty({
      id: 'prop_1',
      siteUrl: 'sc-domain:example.com',
      permissionLevel: 'siteOwner',
      label: 'example.com',
      isSelected: true,
      createdAt: new Date('2024-06-01T12:00:00.000Z'),
      updatedAt: new Date('2024-06-02T12:00:00.000Z'),
      connection: {
        id: 'conn_1',
        email: 'account@example.com',
        name: 'Account',
      },
    });

    const keys = collectJsonKeys(item);
    for (const forbidden of LOW_FORBIDDEN_RESPONSE_KEYS) {
      assert.equal(keys.has(forbidden), false, `unexpected key ${forbidden}`);
    }
    assert.equal(JSON.stringify(item).includes('encryptedAccess'), false);
    assert.equal(JSON.stringify(item).includes('encryptedRefresh'), false);
    assert.equal(JSON.stringify(item).includes('GOOGLE_CLIENT_SECRET'), false);
  });

  it('does not serialize Google connection health fields', () => {
    const item = serializeLowProperty({
      id: 'prop_1',
      siteUrl: 'https://example.com/',
      permissionLevel: 'siteFullUser',
      label: 'example.com',
      isSelected: true,
      createdAt: new Date('2024-06-01T12:00:00.000Z'),
      updatedAt: new Date('2024-06-02T12:00:00.000Z'),
      connection: {
        id: 'conn_1',
        email: 'account@example.com',
        name: 'Account',
      },
    });
    const keys = collectJsonKeys(item);
    for (const key of [
      'status',
      'lastErrorCode',
      'lastErrorMessage',
      'lastErrorAt',
      'lastSuccessAt',
    ]) {
      assert.equal(keys.has(key), false, `LOW contract must not expose ${key}`);
    }
  });
});

describe('LOW integration lifecycle dates', () => {
  it('finds first impression and click dates', () => {
    const found = findEarliestImpressionAndClickDates([
      { date: '2024-01-03', impressions: 0, clicks: 0 },
      { date: '2024-01-01', impressions: 5, clicks: 0 },
      { date: '2024-01-02', impressions: 2, clicks: 1 },
    ]);
    assert.equal(found.firstImpressionDate, '2024-01-01');
    assert.equal(found.firstClickDate, '2024-01-02');
  });

  it('skips rows without impressions/clicks', () => {
    const found = findEarliestImpressionAndClickDates([
      { date: '2024-01-01', impressions: 0, clicks: 0 },
      { date: '2024-01-02', impressions: 0, clicks: 0 },
      { date: '2024-01-03', impressions: 4, clicks: 0 },
      { date: '2024-01-04', impressions: 1, clicks: 2 },
    ]);
    assert.equal(found.firstImpressionDate, '2024-01-03');
    assert.equal(found.firstClickDate, '2024-01-04');
  });

  it('returns null when no data', () => {
    const found = findEarliestImpressionAndClickDates([]);
    assert.equal(found.firstImpressionDate, null);
    assert.equal(found.firstClickDate, null);
  });

  it('does not shift calendar dates across timezones', () => {
    assert.equal(addUtcDays('2024-01-31', 1), '2024-02-01');
    assert.equal(addUtcDays('2024-03-01', -1), '2024-02-29');
    const rows = parseSearchAnalyticsDateRows({
      rows: [{ keys: ['2024-06-15'], impressions: 3, clicks: 1 }],
    });
    assert.equal(rows[0]?.date, '2024-06-15');
  });

  it('handles invalid Google API response safely', () => {
    assert.throws(() => parseSearchAnalyticsDateRows({ rows: 'nope' }), /Invalid Search Console/);
  });

  it('windows are contiguous without gaps or overlaps', () => {
    const windows = enumerateDateWindows('2024-01-01', '2024-01-20', 7);
    assert.deepEqual(windows, [
      { startDate: '2024-01-01', endDate: '2024-01-07' },
      { startDate: '2024-01-08', endDate: '2024-01-14' },
      { startDate: '2024-01-15', endDate: '2024-01-20' },
    ]);
    for (let i = 1; i < windows.length; i++) {
      assert.equal(windows[i]!.startDate, addUtcDays(windows[i - 1]!.endDate, 1));
      assert.ok(windows[i]!.startDate > windows[i - 1]!.endDate);
    }
  });

  it('rejects API dates outside the queried window', () => {
    const rows = parseSearchAnalyticsDateRows(
      {
        rows: [
          { keys: ['2023-12-31'], impressions: 9, clicks: 9 },
          { keys: ['2024-01-05'], impressions: 2, clicks: 1 },
          { keys: ['2024-02-01'], impressions: 9, clicks: 9 },
        ],
      },
      { from: '2024-01-01', to: '2024-01-31' }
    );
    assert.deepEqual(
      rows.map((r) => r.date),
      ['2024-01-05']
    );
  });

  it('lifecycle dates stay within executed searchedFrom/searchedTo', async () => {
    const body = await calculatePropertyLifecycle({
      propertyId: 'prop_1',
      siteUrl: 'sc-domain:example.com',
      connectionId: 'conn_1',
      lookbackDays: 10,
      windowDays: 5,
      timeoutMs: 5000,
      searchedToOverride: '2025-04-10',
      queryFn: async (_connectionId, _siteUrl, requestBody) => {
        const startDate = String(requestBody.startDate);
        const endDate = String(requestBody.endDate);
        return {
          rows: [
            { keys: [startDate], impressions: 2, clicks: 0 },
            { keys: [endDate], impressions: 1, clicks: 3 },
            // Outside the window — must be ignored
            { keys: ['2024-01-01'], impressions: 99, clicks: 99 },
          ],
        };
      },
    });

    assert.equal(body.searchedFrom, '2025-04-01');
    assert.ok(body.firstImpressionDate !== null);
    assert.ok(body.firstClickDate !== null);
    assert.ok(body.firstImpressionDate! >= body.searchedFrom);
    assert.ok(body.firstImpressionDate! <= body.searchedTo);
    assert.ok(body.firstClickDate! >= body.searchedFrom);
    assert.ok(body.firstClickDate! <= body.searchedTo);
    assert.notEqual(body.firstImpressionDate, '2024-01-01');
    assert.equal(body.dateMeaning, 'earliest_available_in_search_console_api');

    const keys = collectJsonKeys(body);
    assert.equal(keys.has('encryptedAccess'), false);
    assert.equal(keys.has('encryptedRefresh'), false);
    assert.equal(keys.has('access_token'), false);
    assert.equal(keys.has('refresh_token'), false);
  });

  it('date earlier than searchedFrom is impossible in the response', async () => {
    const body = await calculatePropertyLifecycle({
      propertyId: 'prop_1',
      siteUrl: 'sc-domain:example.com',
      connectionId: 'conn_1',
      lookbackDays: 5,
      windowDays: 5,
      searchedToOverride: '2025-04-10',
      queryFn: async () => ({
        rows: [{ keys: ['2020-01-01'], impressions: 10, clicks: 10 }],
      }),
    });
    assert.equal(body.firstImpressionDate, null);
    assert.equal(body.firstClickDate, null);
    assert.ok(body.searchedFrom <= body.searchedTo);
  });

  it('date later than searchedTo is impossible in the response', async () => {
    const body = await calculatePropertyLifecycle({
      propertyId: 'prop_1',
      siteUrl: 'sc-domain:example.com',
      connectionId: 'conn_1',
      lookbackDays: 5,
      windowDays: 5,
      searchedToOverride: '2025-04-10',
      queryFn: async () => ({
        rows: [{ keys: ['2030-01-01'], impressions: 10, clicks: 10 }],
      }),
    });
    assert.equal(body.firstImpressionDate, null);
    assert.equal(body.firstClickDate, null);
  });

  it('early stop reports only the executed window range', async () => {
    let calls = 0;
    const body = await calculatePropertyLifecycle({
      propertyId: 'prop_1',
      siteUrl: 'sc-domain:example.com',
      connectionId: 'conn_1',
      lookbackDays: 20,
      windowDays: 5,
      searchedToOverride: '2025-04-20',
      queryFn: async (_c, _s, requestBody) => {
        calls += 1;
        const startDate = String(requestBody.startDate);
        return {
          rows: [
            { keys: [startDate], impressions: 5, clicks: 2 },
          ],
        };
      },
    });

    assert.equal(calls, 1);
    assert.equal(body.searchedFrom, '2025-04-01');
    assert.equal(body.searchedTo, '2025-04-05');
    assert.equal(body.firstImpressionDate, '2025-04-01');
    assert.equal(body.firstClickDate, '2025-04-01');
  });

  it('empty Google rows yield null lifecycle dates', async () => {
    const body = await calculatePropertyLifecycle({
      propertyId: 'prop_1',
      siteUrl: 'sc-domain:example.com',
      connectionId: 'conn_1',
      lookbackDays: 5,
      windowDays: 5,
      searchedToOverride: '2025-04-10',
      queryFn: async () => ({ rows: [] }),
    });
    assert.equal(body.firstImpressionDate, null);
    assert.equal(body.firstClickDate, null);
    assert.equal(body.searchedFrom, '2025-04-06');
    assert.equal(body.searchedTo, '2025-04-10');
  });

  it('lifecycle endpoint returns 404 for unknown property', async () => {
    process.env.GSC_LOW_API_TOKEN = 'test-gsc-low-token';

    const originalFindUnique = (await import('./prisma')).prisma.gscProperty.findUnique;
    const prisma = (await import('./prisma')).prisma;
    prisma.gscProperty.findUnique = (async () => null) as unknown as typeof prisma.gscProperty.findUnique;

    try {
      const res = await getLifecycle(
        new Request('http://localhost/api/integrations/low/properties/missing/lifecycle', {
          headers: authHeaders(),
        }),
        { params: Promise.resolve({ id: 'missing' }) }
      );
      assert.equal(res.status, 404);
    } finally {
      prisma.gscProperty.findUnique = originalFindUnique;
    }
  });
});

describe('middleware bypass', () => {
  it('allows login, oauth callback, and LOW integration without session redirect', () => {
    assert.equal(isMiddlewareAuthBypassPath('/login'), true);
    assert.equal(isMiddlewareAuthBypassPath('/api/auth/login'), true);
    assert.equal(isMiddlewareAuthBypassPath('/api/google/callback'), true);
    assert.equal(isMiddlewareAuthBypassPath('/api/integrations/low/health'), true);
    assert.equal(isMiddlewareAuthBypassPath('/api/integrations/low/properties'), true);
    assert.equal(isMiddlewareAuthBypassPath('/api/integrations/low/properties/x/lifecycle'), true);
  });

  it('keeps dashboard and google connect behind session', () => {
    assert.equal(isMiddlewareAuthBypassPath('/dashboard'), false);
    assert.equal(isMiddlewareAuthBypassPath('/sites/abc'), false);
    assert.equal(isMiddlewareAuthBypassPath('/api/google/connect'), false);
  });
});

describe('cursor helper', () => {
  it('round-trips cursor encoding', () => {
    const encoded = encodeLowPropertiesCursor({
      updatedAt: '2024-01-01T00:00:00.000Z',
      id: 'abc',
    });
    assert.equal(typeof encoded, 'string');
  });
});
