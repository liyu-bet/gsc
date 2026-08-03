import { GoogleApiError } from './google-errors';

export const GOOGLE_WEBMASTERS_SCOPE =
  'https://www.googleapis.com/auth/webmasters';

export const GOOGLE_WEBMASTERS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/webmasters.readonly';

export type GoogleScopeCapabilities = {
  canReadSearchConsole: boolean;
  canManageSitemaps: boolean;
  isReadonly: boolean;
  scopeKnown: boolean;
  requiresSitemapUpgrade: boolean;
};

/** Split OAuth scope strings on whitespace (spaces/tabs/newlines); exact-token matching only. */
export function parseGoogleScopes(scope: string | null | undefined): Set<string> {
  if (scope == null) return new Set();
  const parts = String(scope)
    .split(/[\s]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  return new Set(parts);
}

export function getGoogleScopeCapabilities(
  scope: string | null | undefined
): GoogleScopeCapabilities {
  const scopes = parseGoogleScopes(scope);
  const hasFull = scopes.has(GOOGLE_WEBMASTERS_SCOPE);
  const hasReadonly = scopes.has(GOOGLE_WEBMASTERS_READONLY_SCOPE);

  if (hasFull) {
    return {
      canReadSearchConsole: true,
      canManageSitemaps: true,
      isReadonly: false,
      scopeKnown: true,
      requiresSitemapUpgrade: false,
    };
  }

  if (hasReadonly) {
    return {
      canReadSearchConsole: true,
      canManageSitemaps: false,
      isReadonly: true,
      scopeKnown: true,
      requiresSitemapUpgrade: true,
    };
  }

  // null / empty / unknown legacy — analytics stays available; sitemap needs upgrade.
  return {
    canReadSearchConsole: true,
    canManageSitemaps: false,
    isReadonly: false,
    scopeKnown: false,
    requiresSitemapUpgrade: true,
  };
}

export function canConnectionManageSitemaps(connection: {
  scope: string | null;
}): boolean {
  return getGoogleScopeCapabilities(connection.scope).canManageSitemaps;
}

export function assertCanManageSitemaps(scope: string | null | undefined): void {
  if (!getGoogleScopeCapabilities(scope).canManageSitemaps) {
    throw new GoogleApiError({
      code: 'INSUFFICIENT_SCOPE',
      retryable: false,
      safeMessage:
        'Для управления sitemap переподключите Google-аккаунт и предоставьте полный доступ Search Console',
    });
  }
}

export type GoogleScopeUiKind = 'full' | 'readonly' | 'unknown';

type ScopeUiInput = Pick<
  GoogleScopeCapabilities,
  'canManageSitemaps' | 'isReadonly' | 'scopeKnown' | 'requiresSitemapUpgrade'
>;

export function googleScopeUiKind(capabilities: ScopeUiInput): GoogleScopeUiKind {
  if (capabilities.canManageSitemaps) return 'full';
  if (capabilities.isReadonly) return 'readonly';
  return 'unknown';
}

export function googleScopeBadgeLabel(capabilities: ScopeUiInput): string {
  switch (googleScopeUiKind(capabilities)) {
    case 'full':
      return 'Sitemap: доступ разрешён';
    case 'readonly':
      return 'Только чтение';
    default:
      return 'Разрешения не подтверждены';
  }
}

export function googleScopeBadgeHint(capabilities: ScopeUiInput): string {
  switch (googleScopeUiKind(capabilities)) {
    case 'full':
      return 'Search Console: чтение и управление sitemap';
    case 'readonly':
      return 'Для отправки sitemap нужно расширить доступ';
    default:
      return 'Аналитика доступна. Для управления sitemap проверьте разрешения';
  }
}

export function googleScopeUpgradeCtaLabel(capabilities: ScopeUiInput): string | null {
  if (capabilities.canManageSitemaps) return null;
  if (capabilities.isReadonly) return 'Разрешить управление sitemap';
  return 'Проверить разрешения';
}
