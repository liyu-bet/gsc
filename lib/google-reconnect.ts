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
