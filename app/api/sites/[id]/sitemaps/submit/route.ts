import { NextRequest, NextResponse } from 'next/server';
import * as auth from '@/lib/auth';
import { assertNoSecretsInJson } from '@/lib/connection-health';
import { isBlockedConnectionStatus } from '@/lib/connection-status';
import { submitSitemap } from '@/lib/google-sitemaps';
import { prisma } from '@/lib/prisma';
import { assertSameOriginRequest } from '@/lib/same-origin';
import {
  mapSitemapRouteError,
  validationRouteError,
} from '@/lib/sitemap-route-errors';
import { resolveSitemapUrl } from '@/lib/sitemap-validation';

export const dynamic = 'force-dynamic';

type SubmitBody = {
  sitemap?: unknown;
  domainScheme?: unknown;
};

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

  if (isBlockedConnectionStatus(property.connection.status)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'REAUTH_REQUIRED',
        message: 'Требуется переподключение аккаунта Google',
      },
      { status: 409 }
    );
  }

  let payload: SubmitBody;
  try {
    payload = (await request.json()) as SubmitBody;
  } catch {
    const mapped = validationRouteError('Некорректный JSON запроса');
    return NextResponse.json(mapped.body, { status: mapped.httpStatus });
  }

  const rawSitemap = typeof payload.sitemap === 'string' ? payload.sitemap : '';
  const domainScheme =
    payload.domainScheme === 'http' || payload.domainScheme === 'https'
      ? payload.domainScheme
      : 'https';

  const resolved = resolveSitemapUrl(property.siteUrl, rawSitemap, { domainScheme });
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
