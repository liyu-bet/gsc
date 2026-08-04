import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GoogleApiError } from './google-errors';
import { parseGoogleJsonResponse } from './connection-health';
import { prisma } from './prisma';

describe('parseGoogleJsonResponse', () => {
  it('parses valid JSON', async () => {
    const response = new Response(JSON.stringify({ siteEntry: [{ siteUrl: 'https://a.test/' }] }), {
      status: 200,
    });
    const data = await parseGoogleJsonResponse<{ siteEntry: Array<{ siteUrl: string }> }>(
      'conn_1',
      response,
      'Некорректный ответ Search Console sites.list'
    );
    assert.equal(data.siteEntry[0].siteUrl, 'https://a.test/');
  });

  it('persists INVALID_RESPONSE and throws on malformed JSON (account mode)', async () => {
    const response = new Response('{not-json', { status: 200 });
    const updates: unknown[] = [];
    const originalUpdate = prisma.googleConnection.update;
    prisma.googleConnection.update = (async (args: unknown) => {
      updates.push(args);
      return {};
    }) as typeof prisma.googleConnection.update;

    try {
      await assert.rejects(
        () =>
          parseGoogleJsonResponse('conn_bad', response, 'Некорректный ответ Search Analytics'),
        (error: unknown) =>
          error instanceof GoogleApiError &&
          error.code === 'INVALID_RESPONSE' &&
          error.safeMessage === 'Некорректный ответ Search Analytics'
      );
      assert.equal(updates.length, 1);
      const data = (updates[0] as { data: { lastErrorCode: string; status: string } }).data;
      assert.equal(data.lastErrorCode, 'INVALID_RESPONSE');
      assert.equal(data.status, 'ERROR');
    } finally {
      prisma.googleConnection.update = originalUpdate;
    }
  });

  it('does not persist INVALID_RESPONSE in property-write mode', async () => {
    const response = new Response('{not-json', { status: 200 });
    const updates: unknown[] = [];
    const originalUpdate = prisma.googleConnection.update;
    prisma.googleConnection.update = (async (args: unknown) => {
      updates.push(args);
      return {};
    }) as typeof prisma.googleConnection.update;

    try {
      await assert.rejects(
        () =>
          parseGoogleJsonResponse('conn_sitemap', response, 'Некорректный ответ списка карт сайта', {
            healthMode: 'property-write',
          }),
        (error: unknown) => error instanceof GoogleApiError && error.code === 'INVALID_RESPONSE'
      );
      assert.equal(updates.length, 0);
    } finally {
      prisma.googleConnection.update = originalUpdate;
    }
  });
});
