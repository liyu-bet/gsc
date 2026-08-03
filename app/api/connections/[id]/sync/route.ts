import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { appUrl } from '@/lib/urls';
import { syncSitesForConnection } from '@/lib/google';
import { GoogleApiError } from '@/lib/google-errors';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl('/login'), 303);
  }

  const { id } = await params;
  try {
    await syncSitesForConnection(id);
    return NextResponse.redirect(appUrl('/dashboard'), 303);
  } catch (error) {
    const message =
      error instanceof GoogleApiError
        ? error.safeMessage
        : 'Не удалось обновить сайты';
    return NextResponse.redirect(
      appUrl(`/dashboard?google_error=${encodeURIComponent(message)}`),
      303
    );
  }
}
