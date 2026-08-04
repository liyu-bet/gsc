import { NextRequest, NextResponse } from 'next/server';
import * as auth from '@/lib/auth';
import { assertNoSecretsInJson } from '@/lib/connection-health';
import { mapWithConcurrency } from '@/lib/concurrency';
import { submitSitemap } from '@/lib/google-sitemaps';
import { prisma } from '@/lib/prisma';
import { assertSameOriginRequest } from '@/lib/same-origin';
import { mapSitemapRouteError, validationRouteError } from '@/lib/sitemap-route-errors';
import {
  findForbiddenSitemapBodyKey,
  parseStrictDomainScheme,
  parseStrictPropertyIdArray,
} from '@/lib/sitemap-request-validation';
import { resolveBulkRelativePath } from '@/lib/sitemap-validation';
import { assertConnectionReadyForSitemapWrite } from '@/lib/sitemap-write-guard';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 25;
const CONCURRENCY = 3;

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

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    const mapped = validationRouteError('Некорректный JSON запроса');
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const forbidden = findForbiddenSitemapBodyKey(payload);
  if (forbidden) {
    const mapped = validationRouteError(`Поле ${forbidden} не допускается`);
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const idsParsed = parseStrictPropertyIdArray(payload.propertyIds);
  if (!idsParsed.ok) {
    const mapped = validationRouteError(idsParsed.message);
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }
  if (idsParsed.ids.length === 0) {
    const mapped = validationRouteError('Список propertyIds пуст');
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }
  if (idsParsed.ids.length > MAX_BATCH) {
    const mapped = validationRouteError(`Максимум ${MAX_BATCH} ресурсов в одном batch`);
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  if (typeof payload.relativePath !== 'string') {
    const mapped = validationRouteError('relativePath должен быть строкой');
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }
  const relativePath = payload.relativePath;
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

  const scheme = parseStrictDomainScheme(payload.domainScheme);
  if (!scheme.ok) {
    const mapped = validationRouteError(scheme.message);
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const propertyIds = idsParsed.ids;
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

    try {
      assertConnectionReadyForSitemapWrite(property.connection);
    } catch (error) {
      const mapped = mapSitemapRouteError(error);
      const status =
        mapped.body.code === 'INSUFFICIENT_SCOPE' ||
        mapped.body.code === 'REAUTH_REQUIRED' ||
        mapped.body.code === 'CONNECTION_ERROR'
          ? ('skipped' as const)
          : ('failed' as const);
      return {
        propertyId,
        siteUrl: property.siteUrl,
        sitemapUrl: null,
        status,
        code: mapped.body.code,
        message: mapped.body.message,
      };
    }

    const resolved = resolveBulkRelativePath(property.siteUrl, relativePath, {
      domainScheme: scheme.scheme,
    });
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
