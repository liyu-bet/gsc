/** Reject credential-like / spoof fields on sitemap write JSON bodies. */
export const SITEMAP_FORBIDDEN_BODY_KEYS = [
  'accessToken',
  'refreshToken',
  'connectionId',
  'siteUrl',
  'scope',
  'authorization',
] as const;

export function findForbiddenSitemapBodyKey(
  payload: Record<string, unknown>
): string | null {
  for (const key of SITEMAP_FORBIDDEN_BODY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      return key;
    }
  }
  return null;
}

export function parseStrictDomainScheme(
  value: unknown
): { ok: true; scheme: 'https' | 'http' } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, scheme: 'https' };
  }
  if (value === 'https' || value === 'http') {
    return { ok: true, scheme: value };
  }
  return {
    ok: false,
    message: 'domainScheme должен быть http или https (строчными буквами)',
  };
}

export function parseStrictPropertyIdArray(
  value: unknown
): { ok: true; ids: string[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, message: 'Укажите список propertyIds' };
  }
  if (value.some((item) => typeof item !== 'string')) {
    return { ok: false, message: 'propertyIds должен содержать только строки' };
  }
  const trimmed = (value as string[]).map((id) => id.trim());
  if (trimmed.some((id) => id.length === 0)) {
    return { ok: false, message: 'propertyIds не должен содержать пустые ID' };
  }
  const unique = [...new Set(trimmed)];
  return { ok: true, ids: unique };
}
