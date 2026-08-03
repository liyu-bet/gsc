import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buildGoogleAuthUrl } from '@/lib/google';
import {
  createGoogleOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
} from '@/lib/google-oauth-state';
import { prisma } from '@/lib/prisma';
import { appUrl, isSecureAppUrl } from '@/lib/urls';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl('/login'));
  }

  const connectionId = request.nextUrl.searchParams.get('connectionId');
  if (connectionId) {
    const existing = await prisma.googleConnection.findUnique({
      where: { id: connectionId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.redirect(
        appUrl('/dashboard?google_error=' + encodeURIComponent('Подключение не найдено'))
      );
    }
  }

  const { stateParam, cookieValue } = createGoogleOAuthState(connectionId);
  const redirectUrl = buildGoogleAuthUrl(stateParam);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: isSecureAppUrl(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });
  return response;
}
