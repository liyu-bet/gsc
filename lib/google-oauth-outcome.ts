import type { GoogleOAuthIntent } from './google-oauth-state';

/** Safe dashboard notice after upgrade_sitemap callback (based on saved scope). */
export function oauthUpgradeSitemapNotice(canManageSitemaps: boolean): string {
  return canManageSitemaps
    ? 'Доступ к управлению sitemap предоставлен'
    : 'Разрешение на управление sitemap не было предоставлено';
}

export function oauthCancelNotice(intent: GoogleOAuthIntent | undefined): string {
  if (intent === 'upgrade_sitemap') {
    return 'Расширение разрешений Google отменено';
  }
  return 'Авторизация Google отменена или отклонена';
}

/**
 * Pure decision helper for upgrade/reconnect callback side-effects.
 * Readonly remaining after upgrade must not force ERROR/REVOKED.
 */
export function oauthUpgradeShouldKeepAnalyticsHealthy(
  canManageSitemaps: boolean
): boolean {
  void canManageSitemaps;
  return true;
}
