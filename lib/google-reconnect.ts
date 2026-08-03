import { GoogleApiError } from './google-errors';

/** Ensure reconnect targets the same Google account (profile sub). */
export function assertReconnectGoogleSub(
  expectedGoogleUserId: string,
  actualGoogleUserId: string
): void {
  if (expectedGoogleUserId !== actualGoogleUserId) {
    throw new GoogleApiError({
      code: 'UNAUTHORIZED',
      safeMessage: 'Выбран другой аккаунт Google',
      retryable: false,
    });
  }
}

/**
 * Google often omits refresh_token on reconnect when the grant already exists.
 * Keep the stored encrypted refresh unless a new ciphertext is provided.
 */
export function chooseEncryptedRefreshToken(
  newEncryptedRefresh: string | null | undefined,
  existingEncryptedRefresh: string | null
): string | null {
  if (newEncryptedRefresh) return newEncryptedRefresh;
  return existingEncryptedRefresh;
}

/** Prefer newly granted scope; otherwise keep the previously stored scope. */
export function chooseOAuthScope(
  newScope: string | null | undefined,
  existingScope: string | null
): string | null {
  if (typeof newScope === 'string' && newScope.trim()) return newScope;
  return existingScope;
}
