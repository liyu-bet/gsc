import type { GoogleConnectionStatus } from '@prisma/client';
import { GoogleApiError } from './google-errors';
import { getGoogleScopeCapabilities } from './google-scopes';
import { isBlockedConnectionStatus } from './connection-status';

export type SitemapWriteConnection = {
  id?: string;
  status: GoogleConnectionStatus;
  scope: string | null;
};

/**
 * Server-side gate for sitemap PUT. Does not call Google.
 * Throws GoogleApiError with codes mapped by sitemap-route-errors.
 */
export function assertConnectionReadyForSitemapWrite(
  connection: SitemapWriteConnection | null | undefined
): void {
  if (!connection) {
    throw new GoogleApiError({
      code: 'CONNECTION_NOT_FOUND',
      safeMessage: 'Подключение Google не найдено',
      retryable: false,
    });
  }

  if (isBlockedConnectionStatus(connection.status)) {
    throw new GoogleApiError({
      code: 'REAUTH_REQUIRED',
      safeMessage: 'Требуется переподключение аккаунта Google',
      retryable: false,
    });
  }

  if (connection.status === 'ERROR') {
    throw new GoogleApiError({
      code: 'CONNECTION_ERROR',
      safeMessage: 'Перед отправкой карты сайта повторите проверку подключения Google',
      retryable: false,
    });
  }

  if (connection.status !== 'ACTIVE') {
    throw new GoogleApiError({
      code: 'CONNECTION_ERROR',
      safeMessage: 'Перед отправкой карты сайта повторите проверку подключения Google',
      retryable: false,
    });
  }

  const caps = getGoogleScopeCapabilities(connection.scope);
  if (!caps.canManageSitemaps) {
    throw new GoogleApiError({
      code: 'INSUFFICIENT_SCOPE',
      retryable: false,
      safeMessage:
        'Для управления sitemap переподключите Google-аккаунт и предоставьте полный доступ Search Console',
    });
  }
}

export function assertConnectionReadyForSitemapList(
  connection: SitemapWriteConnection | null | undefined
): void {
  if (!connection) {
    throw new GoogleApiError({
      code: 'CONNECTION_NOT_FOUND',
      safeMessage: 'Подключение Google не найдено',
      retryable: false,
    });
  }

  if (connection.status === 'ACTIVE') {
    // Readonly and full scope both allow listing sitemaps.
    return;
  }

  if (connection.status === 'REVOKED') {
    throw new GoogleApiError({
      code: 'REAUTH_REQUIRED',
      safeMessage: 'Доступ отозван — переподключите аккаунт',
      retryable: false,
    });
  }

  if (connection.status === 'REAUTH_REQUIRED') {
    throw new GoogleApiError({
      code: 'REAUTH_REQUIRED',
      safeMessage: 'Требуется повторный вход в аккаунт Google',
      retryable: false,
    });
  }

  if (connection.status === 'ERROR') {
    throw new GoogleApiError({
      code: 'CONNECTION_ERROR',
      safeMessage: 'Перед загрузкой карт сайта повторите проверку подключения Google',
      retryable: false,
    });
  }

  throw new GoogleApiError({
    code: 'CONNECTION_ERROR',
    safeMessage: 'Перед загрузкой карт сайта повторите проверку подключения Google',
    retryable: false,
  });
}
