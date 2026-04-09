import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  saveOrUpdateConnection,
  syncSitesForConnection,
} from '@/lib/google';
import { appUrl } from '@/lib/urls';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      appUrl(`/dashboard?google_error=${encodeURIComponent(error)}`)
    );
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get('google_oauth_state')?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      appUrl('/dashboard?google_error=invalid_state')
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const user = await fetchGoogleUserInfo(tokens.access_token);
    const connection = await saveOrUpdateConnection({ tokens, user });
    await syncSitesForConnection(connection.id);

    const response = NextResponse.redirect(appUrl('/dashboard'));
    response.cookies.delete('google_oauth_state');
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'google_callback_failed';
    return NextResponse.redirect(
      appUrl(`/dashboard?google_error=${encodeURIComponent(message)}`)
    );
  }
}
