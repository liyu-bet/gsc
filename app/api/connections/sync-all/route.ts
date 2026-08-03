import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appUrl } from '@/lib/urls';
import { syncSitesForConnection } from '@/lib/google';
import { GoogleApiError } from '@/lib/google-errors';
import { isBlockedConnectionStatus } from '@/lib/connection-status';

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl('/login'), 303);
  }

  const connections = await prisma.googleConnection.findMany({
    select: { id: true, status: true, email: true },
    orderBy: { createdAt: 'desc' },
  });

  const errors: string[] = [];
  for (const connection of connections) {
    if (isBlockedConnectionStatus(connection.status)) {
      errors.push(`${connection.email}: требуется переподключение`);
      continue;
    }
    try {
      await syncSitesForConnection(connection.id);
    } catch (error) {
      const message =
        error instanceof GoogleApiError
          ? error.safeMessage
          : 'ошибка обновления';
      errors.push(`${connection.email}: ${message}`);
    }
  }

  if (errors.length) {
    return NextResponse.redirect(
      appUrl(
        `/dashboard?google_error=${encodeURIComponent(
          `Часть аккаунтов не обновилась: ${errors.join('; ')}`
        )}`
      ),
      303
    );
  }

  return NextResponse.redirect(appUrl('/dashboard'), 303);
}
