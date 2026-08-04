import type { GoogleApiError, GoogleApiErrorCode } from './google-errors';

/**
 * account: any Google API error updates connection health.
 * property: Search Analytics — persist only account-wide auth/quota (includes INSUFFICIENT_SCOPE).
 * property-write: Sitemap list/submit — persist auth/quota only; NOT INSUFFICIENT_SCOPE
 *   (local assertCanManageSitemaps already gates; Google 403 may be per-property permission).
 */
export type GoogleHealthMode = 'account' | 'property' | 'property-write';

const PROPERTY_ACCOUNT_LEVEL_ERROR_CODES = new Set<GoogleApiErrorCode>([
  'INVALID_GRANT',
  'UNAUTHORIZED',
  'REAUTH_REQUIRED',
  'INSUFFICIENT_SCOPE',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
]);

const PROPERTY_WRITE_ACCOUNT_LEVEL_ERROR_CODES = new Set<GoogleApiErrorCode>([
  'INVALID_GRANT',
  'UNAUTHORIZED',
  'REAUTH_REQUIRED',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
]);

export function shouldPersistConnectionHealthError(
  error: GoogleApiError,
  healthMode: GoogleHealthMode
): boolean {
  if (healthMode === 'account') return true;
  if (healthMode === 'property-write') {
    return PROPERTY_WRITE_ACCOUNT_LEVEL_ERROR_CODES.has(error.code);
  }
  return PROPERTY_ACCOUNT_LEVEL_ERROR_CODES.has(error.code);
}
