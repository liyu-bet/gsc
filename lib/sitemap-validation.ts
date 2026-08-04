export type SitemapValidationResult =
  | {
      ok: true;
      sitemapUrl: string;
    }
  | {
      ok: false;
      message: string;
    };

const MAX_LENGTH = 2048;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function fail(message: string): SitemapValidationResult {
  return { ok: false, message };
}

function hasCredentials(url: URL): boolean {
  return Boolean(url.username || url.password);
}

function isAllowedHttpPort(url: URL): boolean {
  if (!url.port) return true;
  if (url.protocol === 'http:' && url.port === '80') return true;
  if (url.protocol === 'https:' && url.port === '443') return true;
  return false;
}

function normalizePathname(pathname: string): string {
  const segments = pathname.split('/');
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) {
        // Escaped above root — mark with sentinel handled by caller via prefix check.
        out.push('..');
        continue;
      }
      out.pop();
      continue;
    }
    out.push(segment);
  }
  const joined = '/' + out.join('/');
  return joined === '/' ? '/' : joined;
}

function pathUnderPrefix(candidatePath: string, propertyPathPrefix: string): boolean {
  const prefix = propertyPathPrefix.endsWith('/')
    ? propertyPathPrefix
    : `${propertyPathPrefix}/`;
  const normalized = normalizePathname(candidatePath);
  if (normalized.split('/').includes('..')) return false;
  if (normalized === prefix.slice(0, -1)) return true;
  return normalized === prefix || normalized.startsWith(prefix);
}

function parseDomainProperty(siteUrl: string): string | null {
  const match = /^sc-domain:(.+)$/i.exec(siteUrl.trim());
  if (!match) return null;
  return match[1].trim().toLowerCase();
}

function hostnameAllowedForDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  const base = domain.toLowerCase();
  return host === base || host.endsWith(`.${base}`);
}

function validateCommonAbsolute(url: URL, raw: string): SitemapValidationResult | null {
  if (raw.includes('#')) {
    return fail('URL карты сайта не должен содержать fragment (#)');
  }
  if (url.hash) {
    return fail('URL карты сайта не должен содержать fragment (#)');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fail('Допустимы только http и https URL');
  }
  if (hasCredentials(url)) {
    return fail('URL карты сайта не должен содержать логин или пароль');
  }
  if (!url.hostname) {
    return fail('В URL карты сайта отсутствует hostname');
  }
  return null;
}

function finalizeUrl(url: URL): SitemapValidationResult {
  // Prefer href without unintended trailing changes; URL.href is canonical.
  const href = url.href;
  if (href.length > MAX_LENGTH) {
    return fail('URL карты сайта слишком длинный');
  }
  try {
    // Round-trip parse
    const again = new URL(href);
    if (again.href !== href && again.href.replace(/\/$/, '') !== href.replace(/\/$/, '')) {
      // Accept equivalent forms from URL serializer.
    }
    return { ok: true, sitemapUrl: href };
  } catch {
    return fail('Некорректный URL карты сайта');
  }
}

/**
 * Resolve relative or absolute sitemap input against a GSC property siteUrl.
 * Does not perform HTTP/DNS — SSRF-safe.
 */
export function resolveSitemapUrl(
  propertySiteUrl: string,
  rawInput: string,
  options?: {
    domainScheme?: 'https' | 'http';
  }
): SitemapValidationResult {
  if (rawInput == null || typeof rawInput !== 'string') {
    return fail('Укажите URL или путь карты сайта');
  }
  if (CONTROL_CHARS.test(rawInput)) {
    return fail('URL карты сайта содержит недопустимые символы');
  }
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return fail('Укажите URL или путь карты сайта');
  }
  if (trimmed.length > MAX_LENGTH) {
    return fail('URL карты сайта слишком длинный');
  }

  const domain = parseDomainProperty(propertySiteUrl);
  if (domain) {
    return resolveForDomainProperty(domain, trimmed, options?.domainScheme ?? 'https');
  }

  let propertyUrl: URL;
  try {
    propertyUrl = new URL(propertySiteUrl);
  } catch {
    return fail('Некорректный URL ресурса Search Console');
  }

  if (propertyUrl.protocol !== 'http:' && propertyUrl.protocol !== 'https:') {
    return fail('Ресурс Search Console должен быть http(s) URL-prefix');
  }

  const propertyPath = propertyUrl.pathname.endsWith('/')
    ? propertyUrl.pathname
    : `${propertyUrl.pathname}/`;

  let candidate: URL;
  const looksAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  if (looksAbsolute) {
    try {
      candidate = new URL(trimmed);
    } catch {
      return fail('Некорректный URL карты сайта');
    }
  } else {
    try {
      // Relative to property URL (directory semantics via trailing slash).
      const base = new URL(propertyUrl.href);
      if (!base.pathname.endsWith('/')) {
        base.pathname = `${base.pathname}/`;
      }
      if (trimmed.startsWith('/')) {
        candidate = new URL(trimmed, `${base.protocol}//${base.host}`);
      } else {
        candidate = new URL(trimmed, base);
      }
    } catch {
      return fail('Некорректный путь карты сайта');
    }
  }

  const common = validateCommonAbsolute(candidate, trimmed);
  if (common) return common;

  if (candidate.protocol !== propertyUrl.protocol) {
    return fail('Протокол карты сайта должен совпадать с протоколом ресурса');
  }
  if (candidate.hostname.toLowerCase() !== propertyUrl.hostname.toLowerCase()) {
    return fail('Hostname карты сайта должен совпадать с hostname ресурса');
  }
  if (candidate.port !== propertyUrl.port) {
    return fail('Порт карты сайта должен совпадать с портом ресурса');
  }

  if (!pathUnderPrefix(candidate.pathname, propertyPath)) {
    return fail('Путь карты сайта должен находиться внутри URL-prefix ресурса');
  }

  return finalizeUrl(candidate);
}

function resolveForDomainProperty(
  domain: string,
  trimmed: string,
  scheme: 'https' | 'http'
): SitemapValidationResult {
  const looksAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  let candidate: URL;

  if (looksAbsolute) {
    try {
      candidate = new URL(trimmed);
    } catch {
      return fail('Некорректный URL карты сайта');
    }
  } else {
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    try {
      candidate = new URL(`${scheme}://${domain}${path}`);
    } catch {
      return fail('Некорректный путь карты сайта');
    }
  }

  const common = validateCommonAbsolute(candidate, trimmed);
  if (common) return common;

  if (!hostnameAllowedForDomain(candidate.hostname, domain)) {
    return fail('Hostname карты сайта должен принадлежать домену ресурса');
  }

  if (!isAllowedHttpPort(candidate)) {
    return fail('Для domain-ресурса допустимы только стандартные порты http/https');
  }

  return finalizeUrl(candidate);
}

/**
 * Validate an absolute sitemap index URL for list?sitemapIndex= filter.
 * Relative paths are rejected — only absolute http/https under property rules.
 */
export function validateSitemapIndexUrl(
  propertySiteUrl: string,
  rawInput: string
): SitemapValidationResult {
  if (rawInput == null || typeof rawInput !== 'string') {
    return fail('Укажите абсолютный URL индекса карты сайта');
  }
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return fail('Укажите абсолютный URL индекса карты сайта');
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return fail('Индекс карты сайта должен быть абсолютным http(s) URL');
  }
  return resolveSitemapUrl(propertySiteUrl, trimmed, { domainScheme: 'https' });
}

/**
 * Bulk submit accepts only relative paths (no scheme).
 */
export function resolveBulkRelativePath(
  propertySiteUrl: string,
  relativePath: string,
  options?: { domainScheme?: 'https' | 'http' }
): SitemapValidationResult {
  if (relativePath == null || typeof relativePath !== 'string') {
    return fail('Укажите относительный путь карты сайта');
  }
  const trimmed = relativePath.trim();
  if (!trimmed) {
    return fail('Укажите относительный путь карты сайта');
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.includes('://')) {
    return fail('Для массовой отправки используйте относительный путь, не абсолютный URL');
  }
  return resolveSitemapUrl(propertySiteUrl, trimmed, options);
}
