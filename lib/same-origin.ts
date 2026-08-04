import { appUrl, normalizeBaseUrl } from './urls';
import { env } from './env';

export type SameOriginCheckResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Protect browser state-changing routes: require Origin (or fallback Referer)
 * to match APP_URL origin. Optionally honor Sec-Fetch-Site when present.
 */
export function assertSameOriginRequest(
  headers: Headers,
  options?: { appUrlOverride?: string }
): SameOriginCheckResult {
  const expectedOrigin = new URL(
    normalizeBaseUrl(options?.appUrlOverride ?? env.appUrl)
  ).origin;

  const secFetchSite = headers.get('sec-fetch-site');
  if (secFetchSite) {
    const site = secFetchSite.toLowerCase();
    if (site === 'cross-site' || site === 'none') {
      return { ok: false, message: 'Запрос отклонён: недопустимый Sec-Fetch-Site' };
    }
  }

  const origin = headers.get('origin');
  if (origin) {
    if (origin !== expectedOrigin) {
      return { ok: false, message: 'Запрос отклонён: несовпадение Origin' };
    }
    return { ok: true };
  }

  const referer = headers.get('referer');
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (refererOrigin !== expectedOrigin) {
        return { ok: false, message: 'Запрос отклонён: несовпадение Referer' };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: 'Запрос отклонён: некорректный Referer' };
    }
  }

  // Browser mutations should send Origin or Referer. Reject when both missing.
  return { ok: false, message: 'Запрос отклонён: отсутствует Origin' };
}

/** Convenience for routes that already use appUrl(). */
export function expectedAppOrigin(): string {
  return appUrl('/').origin;
}
