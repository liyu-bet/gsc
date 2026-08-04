import { formatSitemapDate } from './sitemap-view';

export const SITEMAP_DATE_FALLBACK = '—';

export type SitemapDateDisplayState = {
  text: string;
  title: string | null;
  ready: boolean;
};

/**
 * Hydration-safe display state for sitemap timestamps.
 * mounted=false must match server HTML and the first client render.
 */
export function getSitemapDateDisplayState(input: {
  value: string | null | undefined;
  mounted: boolean;
  timeZone?: string;
}): SitemapDateDisplayState {
  const raw = input.value?.trim() || null;
  if (!raw) {
    return { text: SITEMAP_DATE_FALLBACK, title: null, ready: true };
  }

  if (!input.mounted) {
    return {
      text: SITEMAP_DATE_FALLBACK,
      title: raw,
      ready: false,
    };
  }

  const text = formatSitemapDate(raw, input.timeZone);
  if (text === SITEMAP_DATE_FALLBACK) {
    return { text: SITEMAP_DATE_FALLBACK, title: null, ready: true };
  }

  return {
    text,
    title: raw,
    ready: true,
  };
}
