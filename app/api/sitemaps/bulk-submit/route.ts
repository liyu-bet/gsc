import { NextRequest, NextResponse } from 'next/server';
import * as auth from '@/lib/auth';
import { assertNoSecretsInJson } from '@/lib/connection-health';
import { isBlockedConnectionStatus } from '@/lib/connection-status';
import { mapWithConcurrency } from '@/lib/concurrency';
import { submitSitemap } from '@/lib/google-sitemaps';
import { getGoogleScopeCapabilities } from '@/lib/google-scopes';
import { prisma } from '@/lib/prisma';
import { assertSameOriginRequest } from '@/lib/same-origin';
import { mapSitemapRouteError, validationRouteError } from '@/lib/sitemap-route-errors';
import { resolveBulkRelativePath } from '@/lib/sitemap-validation';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 25;
const CONCURRENCY = 3;

type BulkBody = {
  propertyIds?: unknown;
  relativePath?: unknown;
  domainScheme?: unknown;
};

type BulkItemResult = {
  propertyId: string;
  siteUrl: string;
  sitemapUrl: string | null;
  status: 'submitted' | 'failed' | 'skipped';
  code?: string;
  message?: string;
};

export async function POST(request: NextRequest) {
  const session = await auth.getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const origin = assertSameOriginRequest(request.headers);
  if (!origin.ok) {
    return NextResponse.json(
      { ok: false, code: 'FORBIDDEN', message: origin.message },
      { status: 403 }
    );
  }

  let payload: BulkBody;
  try {
    payload = (await request.json()) as BulkBody;
  } catch {
    const mapped = validationRouteError('Некорректный JSON запроса');
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  if (!Array.isArray(payload.propertyIds)) {
    const mapped = validationRouteError('Укажите список propertyIds');
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const rawIds = payload.propertyIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  const propertyIds = [...new Set(rawIds.map((id) => id.trim()))];
  if (propertyIds.length === 0) {
    const mapped = validationRouteError('Список propertyIds пуст');
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }
  if (propertyIds.length > MAX_BATCH) {
    const mapped = validationRouteError(`Максимум ${MAX_BATCH} ресурсов в одном batch`);
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const relativePath = typeof payload.relativePath === 'string' ? payload.relativePath : '';
  const domainScheme =
    payload.domainScheme === 'http' || payload.domainScheme === 'https'
      ? payload.domainScheme
      : 'https';

  if (!relativePath.trim()) {
    const mapped = validationRouteError('Укажите относительный путь карты сайта');
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(relativePath.trim()) || relativePath.includes('://')) {
    const mapped = validationRouteError(
      'Для массовой отправки используйте относительный путь, не абсолютный URL'
    );
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const properties = await prisma.gscProperty.findMany({
    where: { id: { in: propertyIds } },
    include: {
      connection: {
        select: {
          id: true,
          status: true,
          scope: true,
          email: true,
        },
      },
    },
  });

  const byId = new Map(properties.map((p) => [p.id, p]));
  const started = Date.now();

  const results = await mapWithConcurrency(propertyIds, CONCURRENCY, async (propertyId) => {
    const property = byId.get(propertyId);
    if (!property) {
      const item: BulkItemResult = {
        propertyId,
        siteUrl: '',
        sitemapUrl: null,
        status: 'failed',
        code: 'NOT_FOUND',
        message: 'Ресурс не найден',
      };
      return item;
    }

    if (!property.isSelected) {
      return {
        propertyId,
        siteUrl: property.siteUrl,
        sitemapUrl: null,
        status: 'skipped' as const,
        code: 'NOT_SELECTED',
        message: 'Ресурс не выбран в портфеле',
      };
    }

    if (isBlockedConnectionStatus(property.connection.status)) {
      return {
        propertyId,
        siteUrl: property.siteUrl,
        sitemapUrl: null,
        status: 'skipped' as const,
        code: 'REAUTH_REQUIRED',
        message: 'Требуется переподключение аккаунта Google',
      };
    }

    if (property.connection.status === 'ERROR') {
      return {
        propertyId,
        siteUrl: property.siteUrl,
        sitemapUrl: null,
        status: 'skipped' as const,
        code: 'CONNECTION_ERROR',
        message: 'Временная ошибка подключения Google',
      };
    }

    const caps = getGoogleScopeCapabilities(property.connection.scope);
    if (!caps.canManageSitemaps) {
      return {
        propertyId,
        siteUrl: property.siteUrl,
        sitemapUrl: null,
        status: 'skipped' as const,
        code: 'INSUFFICIENT_SCOPE',
        message: 'Недостаточно разрешений для управления sitemap',
      };
    }

    const resolved = resolveBulkRelativePath(property.siteUrl, relativePath, { domainScheme });
    if (!resolved.ok) {
      return {
        propertyId,
        siteUrl: property.siteUrl,
        sitemapUrl: null,
        status: 'failed' as const,
        code: 'VALIDATION',
        message: resolved.message,
      };
    }

    try {
      await submitSitemap(property.connectionId, property.siteUrl, resolved.sitemapUrl);
      return {
        propertyId,
        siteUrl: property.siteUrl,
        sitemapUrl: resolved.sitemapUrl,
        status: 'submitted' as const,
      };
    } catch (error) {
      const mapped = mapSitemapRouteError(error);
      return {
        propertyId,
        siteUrl: property.siteUrl,
        sitemapUrl: resolved.sitemapUrl,
        status: 'failed' as const,
        code: mapped.body.code,
        message: mapped.body.message,
      };
    }
  });

  const summary = {
    total: results.length,
    submitted: results.filter((r) => r.status === 'submitted').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  };

  console.info(
    JSON.stringify({
      op: 'sitemap.bulk-submit',
      status: 200,
      durationMs: Date.now() - started,
      ...summary,
    })
  );

  const body = {
    ok: true as const,
    summary,
    results,
  };
  assertNoSecretsInJson(body);
  return NextResponse.json(body);
}
