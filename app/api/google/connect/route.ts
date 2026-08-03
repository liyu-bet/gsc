import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buildGoogleAuthUrl } from '@/lib/google';
import {
  createGoogleOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
  resolveGoogleOAuthIntent,
} from '@/lib/google-oauth-state';
import { prisma } from '@/lib/prisma';
import { appUrl, isSecureAppUrl } from '@/lib/urls';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl('/login'));
  }

  const resolved = resolveGoogleOAuthIntent({
    intentParam: request.nextUrl.searchParams.get('intent'),
    connectionId: request.nextUrl.searchParams.get('connectionId'),
  });

  if (!resolved.ok) {
    return NextResponse.redirect(
      appUrl(`/dashboard?google_error=${encodeURIComponent(resolved.message)}`)
    );
  }

  if (resolved.connectionId) {
    const existing = await prisma.googleConnection.findUnique({
      where: { id: resolved.connectionId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.redirect(
        appUrl('/dashboard?google_error=' + encodeURIComponent('Подключение не найдено'))
      );
    }
  }

  const { stateParam, cookieValue } = createGoogleOAuthState({
    intent: resolved.intent,
    connectionId: resolved.connectionId,
  });
  const redirectUrl = buildGoogleAuthUrl(stateParam, { intent: resolved.intent });
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
