import { GoogleConnection } from '@prisma/client';
import { addMinutes, format, isValid, parseISO, subDays } from 'date-fns';
import { encrypt } from './security';
import { env } from './env';
import { prisma } from './prisma';
import { googleAuthorizedFetch } from './google-authorized-fetch';
import {
  classifyGoogleHttpError,
  classifyNetworkError,
  GoogleApiError,
} from './google-errors';
import { safePersistConnectionSuccess, parseGoogleJsonResponse } from './connection-health';
import {
  assertReconnectGoogleSub,
  chooseEncryptedRefreshToken,
  chooseOAuthScope,
} from './google-reconnect';
import type { GoogleOAuthIntent } from './google-oauth-state';

export type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export type GscSiteEntry = {
  siteUrl: string;
  permissionLevel?: string;
};

export type SearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export type SearchAnalyticsDataState = 'all' | 'final' | 'hourly_all';

export type SearchAnalyticsResponse = {
  rows?: SearchAnalyticsRow[];
  responseAggregationType?: string;
  metadata?: {
    first_incomplete_date?: string;
    first_incomplete_hour?: string;
  };
};

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

export function latestAvailableDate(): string {
  // Kept for LOW lifecycle lookback semantics (today-2 local lag).
  // UI reports should use gscCalendarDate() from lib/date-ranges.ts instead.
  return format(subDays(new Date(), 2), 'yyyy-MM-dd');
}

export function buildGoogleAuthUrl(
  state: string,
  options?: { intent?: GoogleOAuthIntent }
): string {
  // consent + select_account for connect/reconnect/upgrade so Google re-prompts
  // permissions (required for sitemap scope upgrade) and the correct account.
  void options?.intent;
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent select_account',
    scope: env.googleScopes,
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: env.googleRedirectUri,
    grant_type: 'authorization_code',
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (error) {
    throw classifyNetworkError(error);
  }

  const text = await response.text();
  if (!response.ok) {
    throw classifyGoogleHttpError({
      status: response.status,
      bodyText: text,
      context: 'token_refresh',
    });
  }

  try {
    return JSON.parse(text) as GoogleTokenResponse;
  } catch {
    throw new GoogleApiError({
      code: 'INVALID_RESPONSE',
      safeMessage: 'Некорректный ответ при обмене кода Google',
    });
  }
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch (error) {
    throw classifyNetworkError(error);
  }

  const text = await response.text();
  if (!response.ok) {
    throw classifyGoogleHttpError({
      status: response.status,
      bodyText: text,
      context: 'api',
    });
  }

  try {
    return JSON.parse(text) as GoogleUserInfo;
  } catch {
    throw new GoogleApiError({
      code: 'INVALID_RESPONSE',
      safeMessage: 'Некорректный ответ userinfo Google',
    });
  }
}

export async function listSearchConsoleSites(connectionId: string): Promise<GscSiteEntry[]> {
  const response = await googleAuthorizedFetch(connectionId, `${GSC_BASE}/sites`, {
    method: 'GET',
    recordSuccess: true,
  });

  const data = await parseGoogleJsonResponse<{ siteEntry?: GscSiteEntry[] }>(
    connectionId,
    response,
    'Некорректный ответ Search Console sites.list'
  );
  return data.siteEntry || [];
}

export async function syncSitesForConnection(connectionId: string): Promise<number> {
  const connection = await prisma.googleConnection.findUnique({
    where: { id: connectionId },
    include: { properties: true },
  });
  if (!connection) {
    throw new GoogleApiError({
      code: 'CONNECTION_NOT_FOUND',
      safeMessage: 'Подключение не найдено',
    });
  }

  const sites = await listSearchConsoleSites(connection.id);
  const liveSiteUrls = new Set(sites.map((site) => site.siteUrl));

  await prisma.$transaction([
    ...sites.map((site) =>
      prisma.gscProperty.upsert({
        where: {
          connectionId_siteUrl: {
            connectionId: connection.id,
            siteUrl: site.siteUrl,
          },
        },
        create: {
          connectionId: connection.id,
          siteUrl: site.siteUrl,
          permissionLevel: site.permissionLevel,
          label: deriveSiteLabel(site.siteUrl),
          isSelected: true,
        },
        update: {
          permissionLevel: site.permissionLevel,
          label: deriveSiteLabel(site.siteUrl),
        },
      })
    ),
    prisma.gscProperty.deleteMany({
      where: {
        connectionId: connection.id,
        siteUrl: { notIn: [...liveSiteUrls] },
      },
    }),
  ]);

  await safePersistConnectionSuccess(connectionId, { force: true });
  return sites.length;
}

export async function saveOrUpdateConnection(input: {
  tokens: GoogleTokenResponse;
  user: GoogleUserInfo;
  /** When reconnecting, only update if googleUserId matches this connection. */
  reconnectConnectionId?: string | null;
}): Promise<GoogleConnection> {
  const expiry = input.tokens.expires_in
    ? addMinutes(new Date(), Math.floor(input.tokens.expires_in / 60))
    : null;

  const healthReset = {
    status: 'ACTIVE' as const,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorAt: null,
    lastSuccessAt: new Date(),
  };

  if (input.reconnectConnectionId) {
    const target = await prisma.googleConnection.findUnique({
      where: { id: input.reconnectConnectionId },
    });
    if (!target) {
      throw new GoogleApiError({
        code: 'CONNECTION_NOT_FOUND',
        safeMessage: 'Подключение не найдено',
      });
    }
    if (target.googleUserId !== input.user.sub) {
      assertReconnectGoogleSub(target.googleUserId, input.user.sub);
    }

    return prisma.googleConnection.update({
      where: { id: target.id },
      data: {
        email: input.user.email,
        name: input.user.name,
        picture: input.user.picture,
        encryptedAccess: encrypt(input.tokens.access_token),
        encryptedRefresh: chooseEncryptedRefreshToken(
          input.tokens.refresh_token ? encrypt(input.tokens.refresh_token) : null,
          target.encryptedRefresh
        ),
        tokenExpiry: expiry,
        scope: chooseOAuthScope(input.tokens.scope, target.scope),
        ...healthReset,
      },
    });
  }

  const existing = await prisma.googleConnection.findUnique({
    where: { googleUserId: input.user.sub },
  });

  if (existing) {
    return prisma.googleConnection.update({
      where: { id: existing.id },
      data: {
        email: input.user.email,
        name: input.user.name,
        picture: input.user.picture,
        encryptedAccess: encrypt(input.tokens.access_token),
        encryptedRefresh: chooseEncryptedRefreshToken(
          input.tokens.refresh_token ? encrypt(input.tokens.refresh_token) : null,
          existing.encryptedRefresh
        ),
        tokenExpiry: expiry,
        scope: chooseOAuthScope(input.tokens.scope, existing.scope),
        ...healthReset,
      },
    });
  }

  return prisma.googleConnection.create({
    data: {
      googleUserId: input.user.sub,
      email: input.user.email,
      name: input.user.name,
      picture: input.user.picture,
      encryptedAccess: encrypt(input.tokens.access_token),
      encryptedRefresh: input.tokens.refresh_token ? encrypt(input.tokens.refresh_token) : null,
      tokenExpiry: expiry,
      scope: chooseOAuthScope(input.tokens.scope, null),
      ...healthReset,
    },
  });
}

export async function querySite(
  connectionId: string,
  siteUrl: string,
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal }
) {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const response = await googleAuthorizedFetch(
    connectionId,
    `${GSC_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    }
  );

  return parseGoogleJsonResponse<SearchAnalyticsResponse>(
    connectionId,
    response,
    'Некорректный ответ Search Analytics'
  );
}

export function defaultDateRange(days = 28, endDateInput?: string): {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
} {
  // Compatibility helper for non-UI callers. Prefer buildComparisonRange() for UI ranges.
  const endDate = endDateInput && /^\d{4}-\d{2}-\d{2}$/.test(endDateInput)
    ? endDateInput
    : latestAvailableDate();
  const end = parseISO(endDate);
  const safeEnd = isValid(end) ? end : parseISO(latestAvailableDate());
  const start = subDays(safeEnd, Math.max(1, days) - 1);
  const previousEnd = subDays(start, 1);
  const previousStart = subDays(previousEnd, Math.max(1, days) - 1);

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(safeEnd, 'yyyy-MM-dd'),
    previousStartDate: format(previousStart, 'yyyy-MM-dd'),
    previousEndDate: format(previousEnd, 'yyyy-MM-dd'),
  };
}

export function deriveSiteLabel(siteUrl: string): string {
  if (siteUrl.startsWith('sc-domain:')) {
    return siteUrl.replace('sc-domain:', '');
  }

  try {
    const url = new URL(siteUrl);
    return url.hostname;
  } catch {
    return siteUrl;
  }
}

/** @deprecated Prefer googleAuthorizedFetch — kept only for rare direct callers. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (error) {
    throw classifyNetworkError(error);
  }

  const text = await response.text();
  if (!response.ok) {
    throw classifyGoogleHttpError({
      status: response.status,
      bodyText: text,
      context: 'token_refresh',
    });
  }

  try {
    return JSON.parse(text) as GoogleTokenResponse;
  } catch {
    throw new GoogleApiError({
      code: 'INVALID_RESPONSE',
      safeMessage: 'Некорректный ответ при обновлении токена Google',
    });
  }
}
