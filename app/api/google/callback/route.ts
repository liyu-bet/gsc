import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  saveOrUpdateConnection,
  syncSitesForConnection,
} from '@/lib/google';
import { GoogleApiError } from '@/lib/google-errors';
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  oauthStateErrorMessage,
  parseGoogleOAuthStateCookie,
} from '@/lib/google-oauth-state';
import { appUrl } from '@/lib/urls';

function safeRedirectError(message: string) {
  return NextResponse.redirect(
    appUrl(`/dashboard?google_error=${encodeURIComponent(message)}`)
  );
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return safeRedirectError('Авторизация Google отменена или отклонена');
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const parsed = parseGoogleOAuthStateCookie(storedState, state);

  if (!parsed.ok) {
    const response = safeRedirectError(oauthStateErrorMessage(parsed.reason));
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }

  if (!code) {
    const response = safeRedirectError('Отсутствует код авторизации Google');
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const user = await fetchGoogleUserInfo(tokens.access_token);
    const connection = await saveOrUpdateConnection({
      tokens,
      user,
      reconnectConnectionId: parsed.payload.connectionId,
    });
    await syncSitesForConnection(connection.id);

    const response = NextResponse.redirect(appUrl('/dashboard'));
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  } catch (e) {
    const message =
      e instanceof GoogleApiError
        ? e.safeMessage
        : 'Ошибка callback Google OAuth';
    const response = safeRedirectError(message);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }
}
