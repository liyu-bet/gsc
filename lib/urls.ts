import { env } from './env';

export function normalizeBaseUrl(value: string): string {
  const raw = value.trim().replace(/^['"]|['"]$/g, '');

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  return `https://${raw}`;
}

export function appUrl(path = '/'): URL {
  return new URL(path, normalizeBaseUrl(env.appUrl));
}

export function isSecureAppUrl(): boolean {
  return normalizeBaseUrl(env.appUrl).startsWith('https://');
}
