import { googleAuthorizedFetch } from './google-authorized-fetch';
import { parseGoogleJsonResponse } from './connection-health';
import { GoogleApiError } from './google-errors';
import { prisma } from './prisma';
import { validateSitemapIndexUrl } from './sitemap-validation';
import {
  assertConnectionReadyForSitemapList,
  assertConnectionReadyForSitemapWrite,
} from './sitemap-write-guard';

const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

export type GoogleSitemapContent = {
  type?: string;
  submitted?: string | number;
  indexed?: string | number;
};

export type GoogleSitemapResource = {
  path?: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  lastDownloaded?: string;
  warnings?: string | number;
  errors?: string | number;
  contents?: GoogleSitemapContent[];
};

export type GoogleSitemapListResponse = {
  sitemap?: GoogleSitemapResource[];
};

function sitemapsCollectionUrl(siteUrl: string, sitemapIndex?: string): string {
  const encodedSite = encodeURIComponent(siteUrl);
  const base = `${GSC_BASE}/sites/${encodedSite}/sitemaps`;
  if (!sitemapIndex) return base;
  const params = new URLSearchParams({ sitemapIndex });
  return `${base}?${params.toString()}`;
}

function sitemapFeedUrl(siteUrl: string, sitemapUrl: string): string {
  return `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
}

export class SitemapValidationError extends Error {
  readonly code = 'VALIDATION' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SitemapValidationError';
  }
}

export async function listSitemaps(
  connectionId: string,
  siteUrl: string,
  options?: {
    sitemapIndex?: string;
    signal?: AbortSignal;
  }
): Promise<GoogleSitemapResource[]> {
  const connection = await prisma.googleConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, status: true, scope: true },
  });
  assertConnectionReadyForSitemapList(connection);

  let sitemapIndex: string | undefined;
  if (options?.sitemapIndex) {
    const validated = validateSitemapIndexUrl(siteUrl, options.sitemapIndex);
    if (!validated.ok) {
      throw new SitemapValidationError(validated.message);
    }
    sitemapIndex = validated.sitemapUrl;
  }

  const response = await googleAuthorizedFetch(
    connectionId,
    sitemapsCollectionUrl(siteUrl, sitemapIndex),
    {
      method: 'GET',
      signal: options?.signal,
      cache: 'no-store',
      healthMode: 'property-write',
    }
  );

  const data = await parseGoogleJsonResponse<GoogleSitemapListResponse>(
    connectionId,
    response,
    'Некорректный ответ списка карт сайта',
    { healthMode: 'property-write' }
  );

  return Array.isArray(data.sitemap) ? data.sitemap : [];
}

export async function submitSitemap(
  connectionId: string,
  siteUrl: string,
  sitemapUrl: string,
  options?: {
    signal?: AbortSignal;
  }
): Promise<void> {
  const connection = await prisma.googleConnection.findUnique({
    where: { id: connectionId },
  });
  assertConnectionReadyForSitemapWrite(connection);

  await googleAuthorizedFetch(connectionId, sitemapFeedUrl(siteUrl, sitemapUrl), {
    method: 'PUT',
    signal: options?.signal,
    cache: 'no-store',
    healthMode: 'property-write',
  });
}

/** Test helpers — URL builders without network. */
export const googleSitemapUrlsForTests = {
  sitemapsCollectionUrl,
  sitemapFeedUrl,
};
