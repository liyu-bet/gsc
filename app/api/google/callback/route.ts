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
import { getGoogleScopeCapabilities } from '@/lib/google-scopes';
import {
  oauthCancelNotice,
  oauthUpgradeSitemapNotice,
} from '@/lib/google-oauth-outcome';
import { prisma } from '@/lib/prisma';
import { appUrl } from '@/lib/urls';

function safeRedirectError(message: string) {
  return NextResponse.redirect(
    appUrl(`/dashboard?google_error=${encodeURIComponent(message)}`)
  );
}

function safeRedirectNotice(message: string) {
  return NextResponse.redirect(
    appUrl(`/dashboard?google_notice=${encodeURIComponent(message)}`)
  );
}

function clearState(response: NextResponse) {
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const cookieStore = await cookies();
  const storedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const parsed = parseGoogleOAuthStateCookie(storedState, state);

  if (error) {
    const intent = parsed.ok ? parsed.payload.intent : undefined;
    // Cancellation must not mutate connection tokens/scope/health.
    return clearState(safeRedirectError(oauthCancelNotice(intent)));
  }

  if (!parsed.ok) {
    return clearState(safeRedirectError(oauthStateErrorMessage(parsed.reason)));
  }

  if (!code) {
    return clearState(safeRedirectError('Отсутствует код авторизации Google'));
  }

  const { intent, connectionId } = parsed.payload;

  try {
    const tokens = await exchangeCodeForTokens(code);
    const user = await fetchGoogleUserInfo(tokens.access_token);

    const reconnectId =
      intent === 'reconnect' || intent === 'upgrade_sitemap' ? connectionId : null;

    const connection = await saveOrUpdateConnection({
      tokens,
      user,
      reconnectConnectionId: reconnectId,
    });

    // Re-read saved scope — do not claim upgrade success from token response alone.
    const saved = await prisma.googleConnection.findUniqueOrThrow({
      where: { id: connection.id },
      select: { id: true, scope: true },
    });
    const caps = getGoogleScopeCapabilities(saved.scope);

    await syncSitesForConnection(connection.id);

    if (intent === 'upgrade_sitemap') {
      return clearState(safeRedirectNotice(oauthUpgradeSitemapNotice(caps.canManageSitemaps)));
    }

    return clearState(NextResponse.redirect(appUrl('/dashboard')));
  } catch (e) {
    const message =
      e instanceof GoogleApiError
        ? e.safeMessage
        : 'Ошибка callback Google OAuth';
    return clearState(safeRedirectError(message));
  }
}
