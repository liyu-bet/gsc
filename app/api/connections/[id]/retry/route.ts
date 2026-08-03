import { NextRequest, NextResponse } from 'next/server';
import * as auth from '@/lib/auth';
import {
  assertNoSecretsInJson,
  serializePublicConnection,
} from '@/lib/connection-health';
import { GoogleApiError } from '@/lib/google-errors';
import { syncSitesForConnection } from '@/lib/google';
import { prisma } from '@/lib/prisma';
import { appUrl } from '@/lib/urls';

function wantsJson(request: NextRequest): boolean {
  const accept = request.headers.get('accept') || '';
  return accept.includes('application/json');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.getSession();
  if (!session) {
    if (wantsJson(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(appUrl('/login'), 303);
  }

  const { id } = await params;
  const connection = await prisma.googleConnection.findUnique({
    where: { id },
    include: { _count: { select: { properties: true } } },
  });

  if (!connection) {
    if (wantsJson(request)) {
      return NextResponse.json({ error: 'Подключение не найдено' }, { status: 404 });
    }
    return NextResponse.redirect(
      appUrl('/dashboard?google_error=' + encodeURIComponent('Подключение не найдено')),
      303
    );
  }

  if (connection.status === 'REVOKED' || connection.status === 'REAUTH_REQUIRED') {
    const message = 'Требуется переподключение аккаунта';
    if (wantsJson(request)) {
      const body = {
        error: message,
        connection: serializePublicConnection({
          ...connection,
          propertiesCount: connection._count.properties,
        }),
      };
      assertNoSecretsInJson(body);
      return NextResponse.json(body, { status: 409 });
    }
    return NextResponse.redirect(
      appUrl(`/dashboard?google_error=${encodeURIComponent(message)}`),
      303
    );
  }

  try {
    await syncSitesForConnection(id);
    if (!wantsJson(request)) {
      return NextResponse.redirect(appUrl('/dashboard'), 303);
    }
    const updated = await prisma.googleConnection.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { properties: true } } },
    });
    const body = {
      ok: true as const,
      connection: serializePublicConnection({
        ...updated,
        propertiesCount: updated._count.properties,
      }),
    };
    assertNoSecretsInJson(body);
    return NextResponse.json(body);
  } catch (error) {
    const safeMessage =
      error instanceof GoogleApiError
        ? error.safeMessage
        : 'Не удалось повторить запрос к Google';
    if (!wantsJson(request)) {
      return NextResponse.redirect(
        appUrl(`/dashboard?google_error=${encodeURIComponent(safeMessage)}`),
        303
      );
    }
    const latest = await prisma.googleConnection.findUnique({
      where: { id },
      include: { _count: { select: { properties: true } } },
    });
    const body = {
      ok: false as const,
      error: safeMessage,
      connection: latest
        ? serializePublicConnection({
            ...latest,
            propertiesCount: latest._count.properties,
          })
        : null,
    };
    assertNoSecretsInJson(body);
    return NextResponse.json(body, { status: 502 });
  }
}
