import { NextRequest, NextResponse } from 'next/server';
import * as auth from '@/lib/auth';
import { assertNoSecretsInJson } from '@/lib/connection-health';
import { submitSitemap } from '@/lib/google-sitemaps';
import { prisma } from '@/lib/prisma';
import { assertSameOriginRequest } from '@/lib/same-origin';
import {
  mapSitemapRouteError,
  validationRouteError,
} from '@/lib/sitemap-route-errors';
import {
  findForbiddenSitemapBodyKey,
  parseStrictDomainScheme,
} from '@/lib/sitemap-request-validation';
import { resolveSitemapUrl } from '@/lib/sitemap-validation';
import { assertConnectionReadyForSitemapWrite } from '@/lib/sitemap-write-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: propertyId } = await params;
  const property = await prisma.gscProperty.findUnique({
    where: { id: propertyId },
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

  if (!property) {
    return NextResponse.json(
      { ok: false, code: 'NOT_FOUND', message: 'Ресурс не найден' },
      { status: 404 }
    );
  }

  try {
    assertConnectionReadyForSitemapWrite(property.connection);
  } catch (error) {
    const mapped = mapSitemapRouteError(error);
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
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

  if (typeof payload.sitemap !== 'string') {
    const mapped = validationRouteError('Поле sitemap должно быть строкой');
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const scheme = parseStrictDomainScheme(payload.domainScheme);
  if (!scheme.ok) {
    const mapped = validationRouteError(scheme.message);
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const resolved = resolveSitemapUrl(property.siteUrl, payload.sitemap, {
    domainScheme: scheme.scheme,
  });
  if (!resolved.ok) {
    const mapped = validationRouteError(resolved.message);
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const started = Date.now();
  try {
    await submitSitemap(property.connectionId, property.siteUrl, resolved.sitemapUrl);
    console.info(
      JSON.stringify({
        op: 'sitemap.submit',
        propertyId: property.id,
        status: 200,
        durationMs: Date.now() - started,
      })
    );
    const body = {
      ok: true as const,
      propertyId: property.id,
      siteUrl: property.siteUrl,
      sitemapUrl: resolved.sitemapUrl,
      message: 'Карта сайта отправлена',
    };
    assertNoSecretsInJson(body);
    return NextResponse.json(body);
  } catch (error) {
    const mapped = mapSitemapRouteError(error);
    console.info(
      JSON.stringify({
        op: 'sitemap.submit',
        propertyId: property.id,
        status: mapped.httpStatus,
        code: mapped.body.code,
        durationMs: Date.now() - started,
      })
    );
    assertNoSecretsInJson(mapped.body);
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }
}
