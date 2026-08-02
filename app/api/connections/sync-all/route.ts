import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appUrl } from '@/lib/urls';
import { syncSitesForConnection } from '@/lib/google';

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl('/login'), 303);
  }

  const connections = await prisma.googleConnection.findMany({
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });

  const errors: string[] = [];
  for (const connection of connections) {
    try {
      await syncSitesForConnection(connection.id);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : connection.id);
    }
  }

  if (errors.length) {
    return NextResponse.redirect(
      appUrl(`/dashboard?google_error=${encodeURIComponent(`Часть аккаунтов не обновилась: ${errors.join('; ')}`)}`),
      303
    );
  }

  return NextResponse.redirect(appUrl('/dashboard'), 303);
}
