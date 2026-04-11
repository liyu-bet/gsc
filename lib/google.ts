import { GoogleConnection } from '@prisma/client';
import { addMinutes, format, subDays } from 'date-fns';
import { decrypt, encrypt } from './security';
import { env } from './env';
import { prisma } from './prisma';

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

export type SearchAnalyticsResponse = {
  rows?: SearchAnalyticsRow[];
  metadata?: {
    first_incomplete_date?: string;
    first_incomplete_hour?: string;
  };
};

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
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

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token refresh failed: ${text}`);
  }

  return response.json();
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Google user info: ${text}`);
  }

  return response.json();
}

async function getUsableAccessToken(connection: GoogleConnection): Promise<string> {
  const currentToken = decrypt(connection.encryptedAccess);
  const expiry = connection.tokenExpiry;

  if (expiry && expiry > addMinutes(new Date(), 2)) {
    return currentToken;
  }

  if (!connection.encryptedRefresh) {
    return currentToken;
  }

  const refreshed = await refreshAccessToken(decrypt(connection.encryptedRefresh));
  const updated = await prisma.googleConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccess: encrypt(refreshed.access_token),
      tokenExpiry: refreshed.expires_in ? addMinutes(new Date(), Math.floor(refreshed.expires_in / 60)) : null,
      scope: refreshed.scope || connection.scope,
    },
  });

  return decrypt(updated.encryptedAccess);
}

export async function listSearchConsoleSites(connection: GoogleConnection): Promise<GscSiteEntry[]> {
  const accessToken = await getUsableAccessToken(connection);
  const response = await fetch(`${GSC_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Search Console sites.list failed: ${text}`);
  }

  const data = (await response.json()) as { siteEntry?: GscSiteEntry[] };
  return data.siteEntry || [];
}

export async function syncSitesForConnection(connectionId: string): Promise<number> {
  const connection = await prisma.googleConnection.findUnique({ where: { id: connectionId } });
  if (!connection) {
    throw new Error('Connection not found');
  }

  const sites = await listSearchConsoleSites(connection);

  await Promise.all(
    sites.map((site) =>
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
    )
  );

  return sites.length;
}

export async function saveOrUpdateConnection(input: {
  tokens: GoogleTokenResponse;
  user: GoogleUserInfo;
}): Promise<GoogleConnection> {
  const expiry = input.tokens.expires_in
    ? addMinutes(new Date(), Math.floor(input.tokens.expires_in / 60))
    : null;

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
        encryptedRefresh: input.tokens.refresh_token
          ? encrypt(input.tokens.refresh_token)
          : existing.encryptedRefresh,
        tokenExpiry: expiry,
        scope: input.tokens.scope,
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
      scope: input.tokens.scope,
    },
  });
}

export async function querySite(connectionId: string, siteUrl: string, body: Record<string, unknown>) {
  const connection = await prisma.googleConnection.findUnique({ where: { id: connectionId } });
  if (!connection) {
    throw new Error('Connection not found');
  }

  const accessToken = await getUsableAccessToken(connection);
  const encodedSiteUrl = encodeURIComponent(siteUrl);

  const response = await fetch(`${GSC_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Search Analytics query failed: ${text}`);
  }

  return response.json() as Promise<SearchAnalyticsResponse>;
}

export function defaultDateRange(days = 28): {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
} {
  const end = subDays(new Date(), 1);
  const start = subDays(end, days - 1);
  const previousEnd = subDays(start, 1);
  const previousStart = subDays(previousEnd, days - 1);

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
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