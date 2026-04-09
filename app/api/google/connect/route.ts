import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buildGoogleAuthUrl } from '@/lib/google';
import { randomToken } from '@/lib/security';
import { appUrl, isSecureAppUrl } from '@/lib/urls';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl('/login'));
  }

  const state = randomToken(16);
  const redirectUrl = buildGoogleAuthUrl(state);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: isSecureAppUrl(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });
  return response;
}
