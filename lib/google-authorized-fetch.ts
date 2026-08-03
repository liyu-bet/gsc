import { addMinutes } from 'date-fns';
import type { GoogleConnection } from '@prisma/client';
import { env } from './env';
import {
  classifyGoogleHttpError,
  classifyNetworkError,
  connectionNotFoundError,
  GoogleApiError,
  reauthRequiredError,
} from './google-errors';
import { isBlockedConnectionStatus } from './connection-status';
import {
  persistConnectionError,
  persistConnectionSuccess,
} from './connection-health';
import { decrypt, encrypt } from './security';
import { prisma } from './prisma';

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleAuthorizedFetchOptions = RequestInit & {
  /** When true, always persist success (sites.list / retry). Default: throttled. */
  recordSuccess?: boolean;
};

async function refreshAccessTokenRaw(refreshToken: string): Promise<GoogleTokenResponse> {
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

async function getUsableAccessToken(connection: GoogleConnection): Promise<{
  accessToken: string;
  refreshed: boolean;
  connection: GoogleConnection;
}> {
  const currentToken = decrypt(connection.encryptedAccess);
  const expiry = connection.tokenExpiry;

  if (expiry && expiry > addMinutes(new Date(), 2)) {
    return { accessToken: currentToken, refreshed: false, connection };
  }

  if (!connection.encryptedRefresh) {
    return { accessToken: currentToken, refreshed: false, connection };
  }

  const refreshed = await refreshAccessTokenRaw(decrypt(connection.encryptedRefresh));
  const updated = await prisma.googleConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccess: encrypt(refreshed.access_token),
      tokenExpiry: refreshed.expires_in
        ? addMinutes(new Date(), Math.floor(refreshed.expires_in / 60))
        : null,
      scope: refreshed.scope || connection.scope,
      status: 'ACTIVE',
      lastErrorCode: null,
      lastErrorMessage: null,
      lastErrorAt: null,
      lastSuccessAt: new Date(),
    },
  });

  return {
    accessToken: decrypt(updated.encryptedAccess),
    refreshed: true,
    connection: updated,
  };
}

/**
 * Single authorized Google fetch layer: load connection, gate on status,
 * refresh token when needed, classify errors, persist health fields.
 */
export async function googleAuthorizedFetch(
  connectionId: string,
  input: string | URL,
  init?: GoogleAuthorizedFetchOptions
): Promise<Response> {
  const { recordSuccess, ...requestInit } = init || {};

  const connection = await prisma.googleConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection) {
    throw connectionNotFoundError();
  }

  if (isBlockedConnectionStatus(connection.status)) {
    throw reauthRequiredError(
      connection.status === 'REVOKED'
        ? 'Доступ отозван — переподключите аккаунт'
        : 'Требуется повторный вход в аккаунт Google'
    );
  }

  let accessToken: string;
  let refreshed = false;
  let liveConnection = connection;

  try {
    const tokenResult = await getUsableAccessToken(connection);
    accessToken = tokenResult.accessToken;
    refreshed = tokenResult.refreshed;
    liveConnection = tokenResult.connection;
  } catch (error) {
    if (error instanceof GoogleApiError) {
      await persistConnectionError(connectionId, error);
    }
    throw error;
  }

  const headers = new Headers(requestInit.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(input, {
      ...requestInit,
      headers,
      cache: requestInit.cache ?? 'no-store',
    });
  } catch (error) {
    const classified = classifyNetworkError(error);
    await persistConnectionError(connectionId, classified);
    throw classified;
  }

  if (!response.ok) {
    const bodyText = await response.text();
    const classified = classifyGoogleHttpError({
      status: response.status,
      bodyText,
      context: 'api',
    });
    await persistConnectionError(connectionId, classified);
    throw classified;
  }

  if (!refreshed) {
    await persistConnectionSuccess(connectionId, {
      force: Boolean(recordSuccess),
      connection: liveConnection,
    });
  }

  return response;
}

/** Exposed for unit tests — maps refresh failures without touching DB. */
export async function refreshAccessTokenForTests(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  return refreshAccessTokenRaw(refreshToken);
}
